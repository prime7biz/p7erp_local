import { useMemo, useState } from "react";

import {
  api,
  type PlatformAdminTenantCreatedRow,
  type TenantType,
} from "@/api/client";
import { listPageErrorClass, listTableHeadCellClass, listTableRowClass } from "@/components/app/listPageLayout";
import { Button } from "@/components/ui/button";

const ADMIN_TOKEN_KEY = "p7_platform_admin_token";
const TENANT_TYPES: TenantType[] = ["manufacturer", "buying_house", "both"];

function parseMembers(text: string, fallbackType: TenantType) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [rawName, rawType] = line.split(",").map((part) => part.trim());
      const name = rawName ?? "";
      const tenantType = TENANT_TYPES.includes(rawType as TenantType) ? (rawType as TenantType) : fallbackType;
      return { name, tenant_type: tenantType };
    })
    .filter((row) => row.name);
}

export function BulkTenantOnboardingPage() {
  const [adminToken, setAdminToken] = useState(() => localStorage.getItem(ADMIN_TOKEN_KEY) ?? "");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);

  const [membersText, setMembersText] = useState("Demo Knit Factory Ltd,manufacturer\nDemo Buying House Ltd,buying_house");
  const [defaultTenantType, setDefaultTenantType] = useState<TenantType>("manufacturer");
  const [planId, setPlanId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [created, setCreated] = useState<PlatformAdminTenantCreatedRow[]>([]);

  const members = useMemo(() => parseMembers(membersText, defaultTenantType), [defaultTenantType, membersText]);

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setLoginBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.platformAdminLogin({ username, password });
      localStorage.setItem(ADMIN_TOKEN_KEY, res.access_token);
      setAdminToken(res.access_token);
      setPassword("");
      setSuccess(`Platform admin login successful. Token expires in ${res.expires_in_minutes} minutes.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Platform admin login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  function handleLogout() {
    localStorage.removeItem(ADMIN_TOKEN_KEY);
    setAdminToken("");
    setCreated([]);
    setSuccess("Platform admin token cleared.");
  }

  async function handleBulkCreate() {
    if (!adminToken) {
      setError("Platform admin login is required before bulk onboarding.");
      return;
    }
    if (members.length === 0) {
      setError("Enter at least one tenant factory name.");
      return;
    }
    if (members.length > 200) {
      setError("Maximum 200 tenants per request.");
      return;
    }
    const ok = window.confirm(`Create ${members.length} tenant(s)? This will generate company codes immediately.`);
    if (!ok) return;
    setBusy(true);
    setError("");
    setSuccess("");
    try {
      const res = await api.platformAdminBulkCreateTenants(adminToken, {
        members,
        plan_id: planId.trim() ? Number(planId) : null,
      });
      setCreated(res.items ?? []);
      setSuccess(`Created ${res.created_count} tenant(s). Save the company codes for tenant onboarding.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bulk onboarding failed");
    } finally {
      setBusy(false);
    }
  }

  function downloadCreatedCsv() {
    const body = created.map((r) => `${r.id},${r.company_code ?? ""},"${r.name.replace(/"/g, '""')}"`).join("\n");
    const blob = new Blob([`id,company_code,name\n${body}\n`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `bulk-created-tenants-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-bold text-text-primary">Bulk tenant onboarding</h2>
        <p className="text-sm text-text-muted">
          Platform-admin tool for creating customer factory tenants in batches. Use approved onboarding lists only.
        </p>
      </div>

      {error && <div className={listPageErrorClass}>{error}</div>}
      {success && (
        <div className="rounded-lg border border-status-success/20 bg-status-success-subtle px-4 py-3 text-sm text-status-success-foreground">
          {success}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface-raised p-4">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="font-semibold text-text-primary">Platform admin session</h3>
            <p className="mt-1 text-sm text-text-muted">
              This uses the separate platform-admin login, not the normal tenant user session.
            </p>
          </div>
          {adminToken ? (
            <Button type="button" variant="outline" onClick={handleLogout}>
              Clear admin token
            </Button>
          ) : null}
        </div>

        {!adminToken ? (
          <form onSubmit={handleLogin} className="mt-4 grid gap-3 md:grid-cols-[1fr_1fr_auto]">
            <input
              className="rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Platform admin username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
            <input
              className="rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
            <Button type="submit" disabled={loginBusy}>
              {loginBusy ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-status-success-foreground">Platform admin token is loaded.</p>
        )}
      </section>

      <section className="rounded-xl border border-border bg-surface-raised p-4 space-y-4">
        <div>
          <h3 className="font-semibold text-text-primary">Tenant list</h3>
          <p className="mt-1 text-sm text-text-muted">
            One tenant per line. Format: <code>Factory name,tenant_type</code>. Tenant type can be{" "}
            <code>manufacturer</code>, <code>buying_house</code>, or <code>both</code>.
          </p>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="block text-sm">
            <span className="text-text-muted">Default tenant type</span>
            <select
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
              value={defaultTenantType}
              onChange={(e) => setDefaultTenantType(e.target.value as TenantType)}
            >
              {TENANT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-text-muted">Optional platform plan ID</span>
            <input
              className="mt-1 w-full rounded-lg border border-border px-3 py-2 text-sm"
              placeholder="Leave blank if no plan"
              value={planId}
              onChange={(e) => setPlanId(e.target.value)}
            />
          </label>
        </div>

        <label className="block text-sm">
          <span className="text-text-muted">Tenants ({members.length}/200)</span>
          <textarea
            className="mt-1 min-h-52 w-full rounded-lg border border-border px-3 py-2 font-mono text-sm"
            value={membersText}
            onChange={(e) => setMembersText(e.target.value)}
          />
        </label>

        <Button type="button" onClick={() => void handleBulkCreate()} disabled={busy || !adminToken}>
          {busy ? "Creating tenants..." : `Create ${members.length} tenant(s)`}
        </Button>
      </section>

      {created.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <h3 className="font-semibold text-text-primary">Created tenants</h3>
            <Button type="button" variant="outline" onClick={downloadCreatedCsv}>
              Download company codes
            </Button>
          </div>
          <div className="overflow-hidden rounded-xl border border-border bg-surface-raised">
            <table className="min-w-full text-sm">
              <thead className="bg-surface-subtle border-b border-border text-left">
                <tr>
                  <th className={listTableHeadCellClass}>ID</th>
                  <th className={listTableHeadCellClass}>Company code</th>
                  <th className={listTableHeadCellClass}>Name</th>
                </tr>
              </thead>
              <tbody>
                {created.map((row) => (
                  <tr key={row.id} className={listTableRowClass}>
                    <td className="py-2 px-4">{row.id}</td>
                    <td className="py-2 px-4 font-semibold text-brand-primary">{row.company_code ?? "-"}</td>
                    <td className="py-2 px-4">{row.name}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
