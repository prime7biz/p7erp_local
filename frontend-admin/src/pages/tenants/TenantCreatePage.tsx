import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createTenant } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";

export function TenantCreatePage() {
  const nav = useNavigate();
  const { showToast } = useToast();
  const [name, setName] = useState("");
  const [tenantType, setTenantType] = useState("both");
  const [domain, setDomain] = useState("");
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) {
      showToast("Name is required", "error");
      return;
    }
    setLoading(true);
    try {
      const r = await createTenant({
        name: name.trim(),
        tenant_type: tenantType,
        domain: domain.trim() || null,
      });
      showToast(`Tenant created. Company code: ${r.company_code}`, "success");
      nav(`/tenants/${r.id}`);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <PageHeader title="Create tenant" description="Provision a new tenant and default roles." />
      <form
        onSubmit={onSubmit}
        className="max-w-lg rounded-xl border border-slate-200 bg-white p-6 shadow-sm space-y-4"
      >
        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Tenant name</label>
          <input
            required
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Tenant type</label>
          <select
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={tenantType}
            onChange={(e) => setTenantType(e.target.value)}
          >
            <option value="manufacturer">Manufacturer</option>
            <option value="buying_house">Buying house</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600 uppercase tracking-wide">Domain (optional)</label>
          <input
            className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            placeholder="e.g. tenant.example.com"
          />
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {loading ? "Creating…" : "Create tenant"}
          </button>
          <button
            type="button"
            onClick={() => nav(-1)}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
