import { useCallback, useEffect, useMemo, useState } from "react";
import {
  api,
  setAuth,
  type AuditLogResponse,
  type UserLoginSessionResponse,
  type UserWithRoleResponse,
} from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { useAuth } from "@/context/AuthContext";
import { useLatestRequest } from "@/hooks/useLatestRequest";
import { saveTextFile } from "@/lib/fileSave";
import {
  actionLabel,
  displayUserName,
  endedReasonLabel,
  formatDuration,
  parseImpersonation,
} from "@/pages/settings/userActivityLabels";

type ViewMode = "tenant" | "mine";
type PageTab = "activity" | "sessions";

function toDateInputValue(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function csvEscape(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replaceAll('"', '""')}"`;
  return value;
}

export function AuditPage() {
  const { me } = useAuth();
  const isTenantAdmin =
    (me?.role_name || "").toLowerCase() === "admin" || Boolean(me?.is_tenant_super_admin);

  const [pageTab, setPageTab] = useState<PageTab>("activity");
  const [viewMode, setViewMode] = useState<ViewMode>(isTenantAdmin ? "tenant" : "mine");
  const [logs, setLogs] = useState<AuditLogResponse[]>([]);
  const [sessions, setSessions] = useState<UserLoginSessionResponse[]>([]);
  const [users, setUsers] = useState<UserWithRoleResponse[]>([]);
  const [total, setTotal] = useState(0);
  const [limit] = useState(25);
  const [offset, setOffset] = useState(0);
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [userId, setUserId] = useState("");
  const [ipAddress, setIpAddress] = useState("");
  const [createdFrom, setCreatedFrom] = useState("");
  const [createdTo, setCreatedTo] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [signingOutOthers, setSigningOutOthers] = useState(false);

  const latest = useLatestRequest();

  useEffect(() => {
    if (!isTenantAdmin && viewMode !== "mine") {
      setViewMode("mine");
    }
  }, [isTenantAdmin, viewMode]);

  useEffect(() => {
    if (!isTenantAdmin || viewMode !== "tenant") return;
    void api
      .settingsListUsers()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [isTenantAdmin, viewMode]);

  const filterParams = useMemo(
    () => ({
      action: action.trim() || undefined,
      search: search.trim() || undefined,
      category: category || undefined,
      ip_address: ipAddress.trim() || undefined,
      created_from: createdFrom ? `${createdFrom}T00:00:00` : undefined,
      created_to: createdTo ? `${createdTo}T23:59:59` : undefined,
      user_id: viewMode === "tenant" && userId ? Number(userId) : undefined,
    }),
    [action, search, category, ipAddress, createdFrom, createdTo, userId, viewMode],
  );

  const load = useCallback(async () => {
    const token = latest.begin();
    setLoading(true);
    setError(null);
    try {
      if (pageTab === "sessions") {
        const data =
          viewMode === "mine"
            ? await api.settingsListMySessions({ limit, offset, active_only: activeOnly || undefined })
            : await api.settingsListUserSessions({
                limit,
                offset,
                active_only: activeOnly || undefined,
                user_id: filterParams.user_id,
              });
        if (!latest.isCurrent(token)) return;
        setSessions(data.items);
        setLogs([]);
        setTotal(data.total);
      } else {
        const data =
          viewMode === "mine"
            ? await api.settingsListMyActivity({ limit, offset, ...filterParams })
            : await api.settingsListAuditLogs({
                limit,
                offset,
                ...filterParams,
                user_id: filterParams.user_id,
              });
        if (!latest.isCurrent(token)) return;
        setLogs(data.items);
        setSessions([]);
        setTotal(data.total);
      }
    } catch (e) {
      if (!latest.isCurrent(token)) return;
      setError(e instanceof Error ? e.message : "Failed to load");
    } finally {
      if (latest.isCurrent(token)) setLoading(false);
    }
  }, [latest, limit, offset, filterParams, viewMode, pageTab, activeOnly]);

  useEffect(() => {
    void load();
  }, [load]);

  const applyFilters = (e: React.FormEvent) => {
    e.preventDefault();
    setOffset(0);
    void load();
  };

  const exportCsv = async () => {
    setExporting(true);
    setError(null);
    try {
      if (pageTab === "sessions") {
        const data =
          viewMode === "mine"
            ? await api.settingsListMySessions({ limit: 500, offset: 0, active_only: activeOnly || undefined })
            : await api.settingsListUserSessions({
                limit: 500,
                offset: 0,
                active_only: activeOnly || undefined,
                user_id: filterParams.user_id,
              });
        const headers = [
          "Login at",
          "User",
          "Username",
          "Device",
          "IP",
          "Location",
          "Duration seconds",
          "Active",
          "Ended reason",
          "Logout at",
        ];
        const lines = data.items.map((row) =>
          [
            row.login_at,
            row.full_name ?? "",
            row.username ?? "",
            row.device_label ?? "",
            row.ip_address ?? "",
            row.location ?? "",
            String(row.duration_seconds),
            row.is_active ? "yes" : "no",
            row.ended_reason ?? "",
            row.logout_at ?? "",
          ]
            .map((cell) => csvEscape(String(cell)))
            .join(","),
        );
        const csv = [headers.join(","), ...lines].join("\n");
        await saveTextFile(csv, `user-sessions-${toDateInputValue(new Date())}.csv`, "text/csv;charset=utf-8");
      } else {
        const data =
          viewMode === "mine"
            ? await api.settingsListMyActivity({ limit: 500, offset: 0, ...filterParams })
            : await api.settingsListAuditLogs({
                limit: 500,
                offset: 0,
                ...filterParams,
                user_id: filterParams.user_id,
              });
        const headers = ["Time", "User", "Username", "Action", "Resource", "Details", "IP", "Location", "Impersonated"];
        const lines = data.items.map((row) => {
          const imp = parseImpersonation(row.details);
          return [
            new Date(row.created_at).toISOString(),
            row.full_name ?? "",
            row.username ?? "",
            row.action,
            row.resource ?? "",
            imp.cleanDetails,
            row.ip_address ?? "",
            row.location ?? "",
            imp.isImpersonated ? "yes" : "no",
          ]
            .map((cell) => csvEscape(String(cell)))
            .join(",");
        });
        const csv = [headers.join(","), ...lines].join("\n");
        await saveTextFile(csv, `user-activity-${toDateInputValue(new Date())}.csv`, "text/csv;charset=utf-8");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Export failed");
    } finally {
      setExporting(false);
    }
  };

  const signOutOthers = async () => {
    if (!window.confirm("Sign out of all other devices? This browser stays signed in.")) return;
    setSigningOutOthers(true);
    setError(null);
    try {
      const res = await api.settingsSignOutOtherSessions();
      setAuth(res.access_token, res.tenant_id);
      setOffset(0);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not sign out other devices");
    } finally {
      setSigningOutOthers(false);
    }
  };

  const tabBtn = (id: PageTab, label: string) => (
    <button
      type="button"
      onClick={() => {
        setPageTab(id);
        setOffset(0);
      }}
      className={`rounded-lg border px-3 py-1.5 text-sm ${
        pageTab === id
          ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
          : "border-border bg-surface-raised text-text-secondary"
      }`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <AppPageHeader
        title="User Activity"
        description="See who signed in, how long they stayed, what they changed, and from which IP."
      />

      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("activity", "Activity")}
        {tabBtn("sessions", "Sessions")}
        {isTenantAdmin && (
          <>
            <button
              type="button"
              onClick={() => {
                setViewMode("tenant");
                setOffset(0);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                viewMode === "tenant"
                  ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
                  : "border-border bg-surface-raised text-text-secondary"
              }`}
            >
              All users
            </button>
            <button
              type="button"
              onClick={() => {
                setViewMode("mine");
                setOffset(0);
              }}
              className={`rounded-lg border px-3 py-1.5 text-sm ${
                viewMode === "mine"
                  ? "border-brand-primary bg-brand-primary text-brand-primary-foreground"
                  : "border-border bg-surface-raised text-text-secondary"
              }`}
            >
              My {pageTab === "sessions" ? "sessions" : "activity"}
            </button>
          </>
        )}
        <button
          type="button"
          onClick={() => void exportCsv()}
          disabled={exporting || loading}
          className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary disabled:opacity-50"
        >
          {exporting ? "Exporting…" : "Export CSV"}
        </button>
        {pageTab === "sessions" && viewMode === "mine" && (
          <button
            type="button"
            onClick={() => void signOutOthers()}
            disabled={signingOutOthers || loading}
            className="rounded-lg border border-border bg-surface-raised px-3 py-1.5 text-sm text-text-secondary disabled:opacity-50"
          >
            {signingOutOthers ? "Signing out…" : "Sign out other devices"}
          </button>
        )}
      </div>

      <form onSubmit={applyFilters} className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="grid gap-3 md:grid-cols-3 lg:grid-cols-4">
          {pageTab === "activity" ? (
            <>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="rounded border border-border px-3 py-2 text-sm"
                aria-label="Filter by category"
              >
                <option value="">All categories</option>
                <option value="auth">Sign-in & security</option>
                <option value="data">Data changes</option>
                <option value="approval">Approvals</option>
                <option value="report">Reports</option>
              </select>
              <input
                value={action}
                onChange={(e) => setAction(e.target.value)}
                placeholder="Action code (e.g. LOGIN)"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search details"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <input
                value={ipAddress}
                onChange={(e) => setIpAddress(e.target.value)}
                placeholder="IP address"
                className="rounded border border-border px-3 py-2 text-sm"
              />
              <input
                type="date"
                value={createdFrom}
                onChange={(e) => setCreatedFrom(e.target.value)}
                className="rounded border border-border px-3 py-2 text-sm"
                aria-label="From date"
              />
              <input
                type="date"
                value={createdTo}
                onChange={(e) => setCreatedTo(e.target.value)}
                className="rounded border border-border px-3 py-2 text-sm"
                aria-label="To date"
              />
            </>
          ) : (
            <label className="flex items-center gap-2 text-sm text-text-secondary">
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />
              Active sessions only
            </label>
          )}
          {viewMode === "tenant" && (
            <select
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              className="rounded border border-border px-3 py-2 text-sm"
              aria-label="Filter by user"
            >
              <option value="">All users</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {displayUserName({
                    full_name: [u.first_name, u.last_name].filter(Boolean).join(" ") || null,
                    username: u.username,
                    user_id: u.id,
                  })}
                </option>
              ))}
            </select>
          )}
          <button
            type="submit"
            className="rounded-lg bg-brand-primary px-4 py-2 text-sm font-semibold text-brand-primary-foreground"
          >
            Apply filters
          </button>
        </div>
      </form>

      {error && <p className="text-status-danger-foreground">{error}</p>}
      {loading ? (
        <p>Loading…</p>
      ) : pageTab === "sessions" ? (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-surface-raised text-left">
                  <th className="p-2">Signed in</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Device</th>
                  <th className="p-2">IP</th>
                  <th className="p-2">Location</th>
                  <th className="p-2">Duration</th>
                  <th className="p-2">Status</th>
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-text-muted">
                      No sessions found. Session recording needs USER_SESSION_TRACKING_ENABLED=true on the
                      server, then a fresh sign-in.
                    </td>
                  </tr>
                ) : (
                  sessions.map((row) => (
                    <tr key={row.id} className="border-b border-border align-top">
                      <td className="whitespace-nowrap p-2">{new Date(row.login_at).toLocaleString()}</td>
                      <td className="p-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span>{displayUserName(row)}</span>
                          {row.is_current && (
                            <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] font-medium text-emerald-900">
                              This device
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-2">{row.device_label ?? "—"}</td>
                      <td className="whitespace-nowrap p-2 font-mono text-xs">{row.ip_address ?? "—"}</td>
                      <td className="p-2 text-text-muted">{row.location ?? "—"}</td>
                      <td className="p-2">{formatDuration(row.duration_seconds)}</td>
                      <td className="p-2">
                        {row.is_active ? (
                          <span className="font-medium text-emerald-700">Active</span>
                        ) : (
                          <span className="text-text-muted">{endedReasonLabel(row.ended_reason)}</span>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="border-b-2 border-border bg-surface-raised text-left">
                  <th className="p-2">Time</th>
                  <th className="p-2">User</th>
                  <th className="p-2">Action</th>
                  <th className="p-2">Resource</th>
                  <th className="p-2">Details</th>
                  <th className="p-2">IP</th>
                  <th className="p-2">Location</th>
                </tr>
              </thead>
              <tbody>
                {logs.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-4 text-text-muted">
                      No activity found for these filters.
                    </td>
                  </tr>
                ) : (
                  logs.map((log) => {
                    const imp = parseImpersonation(log.details);
                    return (
                      <tr key={log.id} className="border-b border-border align-top">
                        <td className="whitespace-nowrap p-2">{new Date(log.created_at).toLocaleString()}</td>
                        <td className="p-2">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span>{displayUserName(log)}</span>
                            {imp.isImpersonated && (
                              <span
                                className="rounded bg-amber-100 px-1.5 py-0.5 text-[11px] font-medium text-amber-900"
                                title={
                                  imp.adminId != null
                                    ? `Support admin #${imp.adminId}`
                                    : "Action performed while support was signed in as this user"
                                }
                              >
                                via Support
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-2">
                          <div className="font-medium text-text-primary">{actionLabel(log.action)}</div>
                          <div className="text-xs text-text-muted">{log.action}</div>
                        </td>
                        <td className="p-2">{log.resource ?? "—"}</td>
                        <td className="max-w-xs break-words p-2">{imp.cleanDetails}</td>
                        <td className="whitespace-nowrap p-2 font-mono text-xs">{log.ip_address ?? "—"}</td>
                        <td className="p-2 text-text-muted">{log.location ?? "—"}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}

      {!loading && (
        <div className="flex items-center justify-between text-sm text-text-muted">
          <p>
            Showing {pageTab === "sessions" ? sessions.length : logs.length} of {total}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setOffset((prev) => Math.max(0, prev - limit))}
              disabled={offset === 0}
              className="rounded border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setOffset((prev) => prev + limit)}
              disabled={offset + limit >= total}
              className="rounded border border-border px-3 py-1.5 disabled:opacity-50"
            >
              Next
            </button>
          </div>
        </div>
      )}
      <p className="text-xs text-text-muted">
        Sign-in IP addresses and device details are recorded for security. Contact your administrator if you
        see activity you do not recognize.
      </p>
    </div>
  );
}
