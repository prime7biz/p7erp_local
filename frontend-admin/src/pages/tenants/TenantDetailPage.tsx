import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  getTenant,
  getTenantHealth,
  getTenantStats,
  getTenantEntitlements,
  listTenantUsers,
  patchTenant,
  listSubscriptions,
  listInvoices,
  listPayments,
  getMonitoringUsageForTenant,
  getMonitoringAudit,
  listAiUsage,
  listTenantNotes,
  addTenantNote,
  deleteTenantNote,
  suspendTenant,
  reactivateTenant,
  impersonateTenantUser,
  resetTenantUserPassword,
  deactivateTenantUser,
  activateTenantUser,
  triggerTenantBackup,
  listBackupJobs,
  putTenantSubscription,
  cancelTenantSubscription,
  listSupportTickets,
  type TenantDetailResponse,
  type TenantHealthResponse,
  type TenantStatsResponse,
  type TenantUserListItem,
  type InvoiceItem,
  type PaymentItem,
  type UsageDailyItem,
  type AuditLogItem,
  type TenantNoteItem,
  type TenantEntitlementsResponse,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { DataTable } from "@/components/ui/DataTable";
import { LoadingState } from "@/components/ui/LoadingState";
import { EmptyState } from "@/components/ui/EmptyState";
import { ActionsMenu } from "@/components/ui/ActionsMenu";
import { useToast } from "@/context/ToastContext";
import { formatBytes, formatDateTime, formatUsd } from "@/utils/format";
import { Modal } from "@/components/ui/Modal";
import { useAdminAuth } from "@/context/AdminAuthContext";
import type { AdminCapability } from "@/auth/permissions";

const TENANT_TABS: { id: string; label: string; cap?: AdminCapability }[] = [
  { id: "overview", label: "Overview" },
  { id: "billing", label: "Billing", cap: "billing.view" },
  { id: "users", label: "Users", cap: "tenant_users" },
  { id: "usage", label: "Usage & AI" },
  { id: "flags", label: "Feature flags", cap: "tenants.manage" },
  { id: "notes", label: "Notes", cap: "tenant_support" },
  { id: "support", label: "Support", cap: "support.tickets" },
  { id: "audit", label: "Audit", cap: "monitoring.tenant_audit" },
  { id: "backups", label: "Backups", cap: "operations.backups" },
];

export function TenantDetailPage() {
  const { id } = useParams();
  const tenantId = Number(id);
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const [tab, setTab] = useState("overview");
  const [tenant, setTenant] = useState<TenantDetailResponse | null>(null);
  const [health, setHealth] = useState<TenantHealthResponse | null>(null);
  const [stats, setStats] = useState<TenantStatsResponse | null>(null);
  const [users, setUsers] = useState<TenantUserListItem[]>([]);
  const [subs, setSubs] = useState<{ id: number; plan_id: number; status: string; billing_cycle: string }[]>([]);
  const [invoices, setInvoices] = useState<InvoiceItem[]>([]);
  const [payments, setPayments] = useState<PaymentItem[]>([]);
  const [usage, setUsage] = useState<UsageDailyItem[]>([]);
  const [audit, setAudit] = useState<AuditLogItem[]>([]);
  const [aiRows, setAiRows] = useState<{ id: number; feature: string | null; total_tokens: number | null }[]>([]);
  const [notes, setNotes] = useState<TenantNoteItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [openUserActions, setOpenUserActions] = useState<string | number | null>(null);
  const [flagJson, setFlagJson] = useState("");
  const [pwdModal, setPwdModal] = useState<{ userId: number; pwd: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [planId, setPlanId] = useState("");
  const [backupsLocal, setBackupsLocal] = useState<
    { id: number; status: string; backup_type: string; created_at: string | null }[]
  >([]);
  const [entitlements, setEntitlements] = useState<TenantEntitlementsResponse | null>(null);
  const [supportRows, setSupportRows] = useState<
    { id: number; title: string; status: string; priority: string; created_at: string | null }[]
  >([]);

  const visibleTabs = useMemo(() => TENANT_TABS.filter((x) => !x.cap || can(x.cap)), [can]);

  const loadCore = useCallback(async () => {
    if (!Number.isFinite(tenantId)) return;
    setErr(null);
    try {
      const [t, h, s, ent] = await Promise.all([
        getTenant(tenantId),
        getTenantHealth(tenantId),
        getTenantStats(tenantId),
        getTenantEntitlements(tenantId).catch(() => null),
      ]);
      setTenant(t);
      setHealth(h);
      setStats(s);
      setEntitlements(ent);
      setFlagJson(JSON.stringify(t.feature_flags ?? {}, null, 2));
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Failed to load tenant");
    }
  }, [tenantId]);

  const loadTab = useCallback(async () => {
    if (!Number.isFinite(tenantId)) return;
    try {
      if (tab === "users") {
        const r = await listTenantUsers(tenantId);
        setUsers(r.items);
      }
      if (tab === "billing") {
        const [subR, invR, payR] = await Promise.all([
          listSubscriptions({ tenant_id: tenantId }),
          listInvoices(),
          listPayments(),
        ]);
        setSubs(subR.items);
        setInvoices(invR.items.filter((i) => i.tenant_id === tenantId));
        setPayments(payR.items.filter((p) => p.tenant_id === tenantId));
      }
      if (tab === "usage") {
        const u = await getMonitoringUsageForTenant(tenantId, 30);
        setUsage(u.items);
        const ai = await listAiUsage({ tenant_id: tenantId, limit: 200 });
        setAiRows(
          ai.items.map((x) => ({ id: x.id, feature: x.feature, total_tokens: x.total_tokens })),
        );
      }
      if (tab === "audit") {
        const a = await getMonitoringAudit({ tenant_id: tenantId, page: 1, page_size: 50 });
        setAudit(a.items);
      }
      if (tab === "notes") {
        const n = await listTenantNotes(tenantId);
        setNotes(n.items as TenantNoteItem[]);
      }
      if (tab === "backups") {
        const jobs = await listBackupJobs(1, 100);
        setBackupsLocal(jobs.items.filter((j) => j.tenant_id === tenantId));
      }
      if (tab === "support") {
        const r = await listSupportTickets({ tenant_id: tenantId });
        setSupportRows(
          r.items.map((x) => ({
            id: x.id,
            title: x.title,
            status: x.status,
            priority: x.priority,
            created_at: x.created_at ?? null,
          })),
        );
      }
    } catch {
      /* tab-level errors */
    }
  }, [tenantId, tab]);

  useEffect(() => {
    if (!visibleTabs.some((x) => x.id === tab)) setTab("overview");
  }, [visibleTabs, tab]);

  useEffect(() => {
    setLoading(true);
    loadCore().finally(() => setLoading(false));
  }, [loadCore]);

  useEffect(() => {
    loadTab();
  }, [loadTab]);

  const risk = useMemo(() => {
    const flags: string[] = [];
    if (health && !health.is_active) flags.push("Inactive");
    if (health && health.recent_5xx_request_logs > 0) flags.push("Recent 5xx API errors");
    return flags;
  }, [health]);

  async function saveFlags() {
    try {
      const parsed = JSON.parse(flagJson || "{}") as Record<string, unknown>;
      await patchTenant(tenantId, { feature_flags: parsed });
      showToast("Feature flags updated", "success");
      loadCore();
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Invalid JSON", "error");
    }
  }

  async function addNote() {
    if (!noteText.trim()) return;
    try {
      await addTenantNote(tenantId, { content: noteText.trim(), is_pinned: false });
      setNoteText("");
      showToast("Note added", "success");
      const n = await listTenantNotes(tenantId);
      setNotes(n.items as TenantNoteItem[]);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Failed", "error");
    }
  }

  if (!Number.isFinite(tenantId)) return <p className="text-red-600">Invalid tenant</p>;
  if (loading && !tenant) return <LoadingState />;
  if (err || !tenant) return <p className="text-red-600">{err ?? "Not found"}</p>;

  return (
    <div>
      <PageHeader
        title={tenant.name}
        description={`Company code: ${tenant.company_code ?? "—"} · ID ${tenant.id}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link to="/tenants" className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-700">
              Back to list
            </Link>
            {can("tenants.manage") &&
              (tenant.is_active ? (
                <button
                  type="button"
                  disabled={!!tenant.deleted_at}
                  onClick={async () => {
                    await suspendTenant(tenantId);
                    showToast("Suspended", "success");
                    loadCore();
                  }}
                  className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm text-amber-900"
                >
                  Suspend
                </button>
              ) : (
                <button
                  type="button"
                  onClick={async () => {
                    await reactivateTenant(tenantId);
                    showToast("Reactivated", "success");
                    loadCore();
                  }}
                  className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm text-emerald-900"
                >
                  Reactivate
                </button>
              ))}
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <StatusBadge variant={tenant.is_active ? "success" : "neutral"}>
          {tenant.deleted_at ? "Deleted" : tenant.is_active ? "Active" : "Inactive"}
        </StatusBadge>
        <span className="text-xs text-slate-500 capitalize">{tenant.tenant_type.replace(/_/g, " ")}</span>
        {risk.map((r) => (
          <StatusBadge key={r} variant="warning">
            {r}
          </StatusBadge>
        ))}
      </div>

      <Tabs
        tabs={visibleTabs.map((t) => ({ id: t.id, label: t.label }))}
        active={tab}
        onChange={(t) => setTab(t)}
      />

      {tab === "overview" && (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2 text-sm">
            <h3 className="font-medium text-slate-800">Profile</h3>
            <p>
              <span className="text-slate-500">Domain:</span> {tenant.domain ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Country / TZ:</span> {tenant.country_code ?? "—"} /{" "}
              {tenant.timezone ?? "—"}
            </p>
            <p>
              <span className="text-slate-500">Created:</span> {formatDateTime(tenant.created_at)}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2 text-sm">
            <h3 className="font-medium text-slate-800">Health</h3>
            <p>
              <span className="text-slate-500">Last user login:</span>{" "}
              {formatDateTime(health?.last_user_login ?? null)}
            </p>
            <p>
              <span className="text-slate-500">Recent 5xx (audit):</span>{" "}
              {health?.recent_5xx_request_logs ?? "—"}
            </p>
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2 text-sm md:col-span-2">
            <h3 className="font-medium text-slate-800">Data summary</h3>
            <p>
              Users: {stats?.user_count ?? "—"} · Orders: {stats?.order_count ?? "—"} · Customers:{" "}
              {stats?.customer_count ?? "—"} · Storage: {formatBytes(stats?.storage_bytes_used)}
            </p>
          </div>
          {entitlements?.plan && (
            <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-2 text-sm md:col-span-2">
              <h3 className="font-medium text-slate-800">Plan & entitlements</h3>
              <p>
                <span className="text-slate-500">Plan:</span> {entitlements.plan.name} ({entitlements.plan.code})
              </p>
              <p>
                <span className="text-slate-500">Limits:</span> users ≤ {entitlements.plan.max_users} · storage ≤{" "}
                {entitlements.plan.max_storage_gb} GB · AI tokens/mo ≤ {entitlements.plan.max_ai_tokens_monthly}
              </p>
              <p>
                <span className="text-slate-500">Support tier:</span> {entitlements.plan.support_level}
              </p>
              <p className="text-xs text-slate-500">
                Effective module keys merge plan <code className="font-mono">features_included</code> with tenant{" "}
                <code className="font-mono">feature_flags</code> (tenant overrides win on key clash).
              </p>
            </div>
          )}
        </div>
      )}

      {tab === "billing" && (
        <div className="space-y-6">
          <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-medium text-slate-800 mb-3">Subscription</h3>
            {subs.length === 0 ? (
              <EmptyState title="No subscription" description="Assign a plan below." />
            ) : (
              <ul className="text-sm space-y-1">
                {subs.map((s) => (
                  <li key={s.id}>
                    Plan #{s.plan_id} · {s.status} · {s.billing_cycle}
                  </li>
                ))}
              </ul>
            )}
            <div className="mt-4 flex flex-wrap gap-2 items-end">
              <div>
                <label className="block text-xs text-slate-500">Plan ID</label>
                <input
                  className="rounded-lg border border-slate-200 px-2 py-1 text-sm w-32"
                  value={planId}
                  onChange={(e) => setPlanId(e.target.value)}
                  placeholder="e.g. 1"
                />
              </div>
              <button
                type="button"
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white"
                onClick={async () => {
                  const pid = parseInt(planId, 10);
                  if (!pid) {
                    showToast("Enter plan id", "error");
                    return;
                  }
                  await putTenantSubscription(tenantId, { plan_id: pid, status: "active" });
                  showToast("Subscription updated", "success");
                  loadTab();
                }}
              >
                Assign / update
              </button>
              <button
                type="button"
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs"
                onClick={async () => {
                  await cancelTenantSubscription(tenantId);
                  showToast("Cancelled", "success");
                  loadTab();
                }}
              >
                Cancel subscription
              </button>
            </div>
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-800 mb-2">Invoices</h3>
            <DataTable
              columns={[
                { key: "n", header: "#", cell: (i) => i.invoice_number },
                { key: "t", header: "Total", cell: (i) => formatUsd(i.total) },
                { key: "s", header: "Status", cell: (i) => i.status },
                { key: "d", header: "Due", cell: (i) => i.due_date ?? "—" },
              ]}
              rows={invoices}
              rowKey={(i) => i.id}
              emptyMessage="No invoices for this tenant."
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-800 mb-2">Payments</h3>
            <DataTable
              columns={[
                { key: "a", header: "Amount", cell: (p) => formatUsd(p.amount) },
                { key: "m", header: "Method", cell: (p) => p.method },
                { key: "t", header: "Paid", cell: (p) => formatDateTime(p.paid_at) },
              ]}
              rows={payments}
              rowKey={(p) => p.id}
              emptyMessage="No payments."
            />
          </div>
        </div>
      )}

      {tab === "users" && (
        <DataTable
          columns={[
            { key: "u", header: "Username", cell: (u) => u.username },
            { key: "e", header: "Email", cell: (u) => u.email },
            { key: "r", header: "Role", cell: (u) => u.role_name ?? "—" },
            {
              key: "a",
              header: "Active",
              cell: (u) => <StatusBadge variant={u.is_active ? "success" : "neutral"}>{u.is_active ? "Yes" : "No"}</StatusBadge>,
            },
            {
              key: "x",
              header: "",
              cell: (u) => (
                <ActionsMenu
                  rowId={u.id}
                  openId={openUserActions}
                  onOpenChange={setOpenUserActions}
                  actions={[
                    {
                      label: "Reset password",
                      onClick: async () => {
                        const r = await resetTenantUserPassword(tenantId, u.id);
                        setPwdModal({ userId: u.id, pwd: r.temporary_password });
                      },
                    },
                    {
                      label: "Impersonate",
                      onClick: async () => {
                        const r = await impersonateTenantUser(tenantId, u.id);
                        showToast(`Copied token (expires ${r.expires_in_minutes}m). Check console.`, "info");
                        console.info("Tenant JWT", r.access_token);
                      },
                    },
                    {
                      label: u.is_active ? "Deactivate" : "Activate",
                      onClick: async () => {
                        if (u.is_active) await deactivateTenantUser(tenantId, u.id);
                        else await activateTenantUser(tenantId, u.id);
                        showToast("Updated", "success");
                        loadTab();
                      },
                    },
                  ]}
                />
              ),
            },
          ]}
          rows={users}
          rowKey={(u) => u.id}
          emptyMessage="No users."
        />
      )}

      {tab === "usage" && (
        <div className="space-y-6">
          <div>
            <h3 className="text-sm font-medium text-slate-800 mb-2">Daily usage (recent)</h3>
            <DataTable
              columns={[
                { key: "d", header: "Date", cell: (i) => i.date ?? "—" },
                { key: "a", header: "API calls", cell: (i) => i.api_calls_count },
                { key: "e", header: "Errors", cell: (i) => i.api_errors_count },
                { key: "s", header: "Storage", cell: (i) => formatBytes(Number(i.storage_bytes_used)) },
              ]}
              rows={usage}
              rowKey={(i) => i.id}
              emptyMessage="No usage rows."
            />
          </div>
          <div>
            <h3 className="text-sm font-medium text-slate-800 mb-2">AI usage (recent)</h3>
            <DataTable
              columns={[
                { key: "f", header: "Feature", cell: (r) => r.feature ?? "—" },
                { key: "t", header: "Tokens", cell: (r) => r.total_tokens ?? "—" },
              ]}
              rows={aiRows}
              rowKey={(r) => r.id}
              emptyMessage="No AI usage."
            />
          </div>
        </div>
      )}

      {tab === "flags" && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
          <div>
            <label className="block text-xs text-slate-500 mb-1">feature_flags JSON</label>
            <textarea
              className="w-full max-w-2xl font-mono text-xs rounded-lg border border-slate-200 p-3 min-h-[200px]"
              value={flagJson}
              onChange={(e) => setFlagJson(e.target.value)}
            />
          </div>
          <button
            type="button"
            onClick={saveFlags}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
          >
            Save flags
          </button>
        </div>
      )}

      {tab === "notes" && (
        <div className="space-y-4">
          {can("tenant_support") && (
            <div className="flex gap-2">
              <textarea
                className="flex-1 rounded-lg border border-slate-200 p-2 text-sm min-h-[80px]"
                value={noteText}
                onChange={(e) => setNoteText(e.target.value)}
                placeholder="Internal note…"
              />
              <button
                type="button"
                onClick={addNote}
                className="self-start rounded-lg bg-indigo-600 px-3 py-2 text-sm text-white"
              >
                Add
              </button>
            </div>
          )}
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className="rounded-lg border border-slate-100 bg-white p-3 text-sm">
                <div className="flex justify-between gap-2">
                  <p className="text-slate-800 whitespace-pre-wrap">{n.content}</p>
                  <button
                    type="button"
                    className="text-xs text-red-600"
                    onClick={async () => {
                      await deleteTenantNote(n.id);
                      showToast("Deleted", "success");
                      const nn = await listTenantNotes(tenantId);
                      setNotes(nn.items as TenantNoteItem[]);
                    }}
                  >
                    Delete
                  </button>
                </div>
                <div className="text-xs text-slate-400 mt-1">{formatDateTime(n.created_at)}</div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {tab === "support" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2 items-center justify-between">
            <p className="text-sm text-slate-600">Tickets linked to this tenant (SLA and escalation on the main queue).</p>
            <Link
              to={`/support/tickets?tenant_id=${tenantId}`}
              className="text-sm font-medium text-indigo-600 hover:underline"
            >
              Open filtered queue
            </Link>
          </div>
          <DataTable
            columns={[
              { key: "id", header: "ID", cell: (r) => r.id },
              { key: "t", header: "Title", cell: (r) => r.title },
              { key: "s", header: "Status", cell: (r) => r.status },
              { key: "p", header: "Priority", cell: (r) => r.priority },
              { key: "c", header: "Created", cell: (r) => formatDateTime(r.created_at) },
            ]}
            rows={supportRows}
            rowKey={(r) => r.id}
            emptyMessage="No tickets for this tenant."
          />
        </div>
      )}

      {tab === "audit" && (
        <DataTable
          columns={[
            { key: "a", header: "Action", cell: (r) => r.action },
            { key: "p", header: "Path", cell: (r) => <span className="font-mono text-xs break-all">{r.request_path ?? "—"}</span> },
            { key: "s", header: "Status", cell: (r) => r.response_status ?? "—" },
            { key: "t", header: "Time", cell: (r) => formatDateTime(r.created_at) },
          ]}
          rows={audit}
          rowKey={(r) => r.id}
          emptyMessage="No audit entries."
        />
      )}

      {tab === "backups" && (
        <div className="space-y-4">
          <button
            type="button"
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={async () => {
              await triggerTenantBackup(tenantId);
              showToast("Backup job completed", "success");
              const jobs = await listBackupJobs(1, 100);
              setBackupsLocal(jobs.items.filter((j) => j.tenant_id === tenantId));
            }}
          >
            Run tenant backup
          </button>
          <DataTable
            columns={[
              { key: "id", header: "ID", cell: (j) => j.id },
              { key: "t", header: "Type", cell: (j) => j.backup_type },
              { key: "s", header: "Status", cell: (j) => j.status },
              { key: "c", header: "Created", cell: (j) => formatDateTime(j.created_at) },
            ]}
            rows={backupsLocal}
            rowKey={(j) => j.id}
            emptyMessage="No backups for this tenant."
          />
        </div>
      )}

      <Modal open={!!pwdModal} onClose={() => setPwdModal(null)} title="Temporary password" size="sm">
        {pwdModal && (
          <div className="space-y-2">
            <p className="text-sm text-slate-600">Store this password securely. It is shown once.</p>
            <code className="block rounded bg-slate-100 p-2 text-sm break-all">{pwdModal.pwd}</code>
          </div>
        )}
      </Modal>
    </div>
  );
}
