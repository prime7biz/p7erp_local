import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { createBillingPlan, listBillingPlans, patchBillingPlan } from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { useToast } from "@/context/ToastContext";
import { LoadingState } from "@/components/ui/LoadingState";

export function PlanFormPage() {
  const { id } = useParams();
  /** `/billing/plans/new` has no `:id` param — `id` is undefined; edit uses `billing/plans/:id/edit`. */
  const isNew = id === undefined;
  const nav = useNavigate();
  const { showToast } = useToast();
  const [loading, setLoading] = useState(!isNew);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [maxUsers, setMaxUsers] = useState(10);
  const [maxStorage, setMaxStorage] = useState(10);
  const [maxAi, setMaxAi] = useState(100000);
  const [priceM, setPriceM] = useState(0);
  const [priceY, setPriceY] = useState(0);
  const [active, setActive] = useState(true);
  const [sortOrder, setSortOrder] = useState(0);
  const [featuresJson, setFeaturesJson] = useState("{}");
  const [supportLevel, setSupportLevel] = useState("standard");
  const [addonsJson, setAddonsJson] = useState("{}");
  const [overageJson, setOverageJson] = useState("{}");

  useEffect(() => {
    if (isNew || !id) return;
    listBillingPlans()
      .then((r) => {
        const p = r.items.find((x) => x.id === Number(id));
        if (!p) {
          showToast("Plan not found", "error");
          nav("/billing/plans");
          return;
        }
        setName(p.name);
        setCode(p.code ?? "");
        setMaxUsers(p.max_users ?? 0);
        setMaxStorage(p.max_storage_gb ?? 0);
        setMaxAi(p.max_ai_tokens_monthly ?? 0);
        setPriceM(p.price_monthly_usd);
        setPriceY(p.price_yearly_usd ?? 0);
        setActive(p.is_active);
        setSortOrder(p.sort_order ?? 0);
        setFeaturesJson(JSON.stringify(p.features_included ?? {}, null, 2));
        setSupportLevel(p.support_level ?? "standard");
        setAddonsJson(JSON.stringify(p.optional_addons ?? {}, null, 2));
        setOverageJson(JSON.stringify(p.overage_rules ?? {}, null, 2));
      })
      .finally(() => setLoading(false));
  }, [id, isNew, nav, showToast]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    let features: unknown = {};
    let addons: unknown = {};
    let overage: unknown = {};
    try {
      features = JSON.parse(featuresJson || "{}");
      addons = JSON.parse(addonsJson || "{}");
      overage = JSON.parse(overageJson || "{}");
    } catch {
      showToast("Invalid JSON in one of the JSON fields", "error");
      return;
    }
    const body = {
      name,
      code,
      max_users: maxUsers,
      max_storage_gb: maxStorage,
      max_ai_tokens_monthly: maxAi,
      price_monthly_usd: priceM,
      price_yearly_usd: priceY,
      is_active: active,
      sort_order: sortOrder,
      features_included: features,
      support_level: supportLevel,
      optional_addons: addons,
      overage_rules: overage,
    };
    try {
      if (isNew) {
        await createBillingPlan(body);
        showToast("Plan created", "success");
      } else {
        await patchBillingPlan(Number(id), body);
        showToast("Plan updated", "success");
      }
      nav("/billing/plans");
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : "Failed", "error");
    }
  }

  if (loading) return <LoadingState />;

  return (
    <div>
      <PageHeader title={isNew ? "New plan" : "Edit plan"} description="Configure limits and pricing." />
      <form onSubmit={onSubmit} className="max-w-xl space-y-4 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div>
          <label className="block text-xs font-medium text-slate-600">Name</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={name} onChange={(e) => setName(e.target.value)} required />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Code</label>
          <input className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-mono" value={code} onChange={(e) => setCode(e.target.value)} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Max users</label>
            <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={maxUsers} onChange={(e) => setMaxUsers(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Max storage GB</label>
            <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={maxStorage} onChange={(e) => setMaxStorage(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Max AI tokens / month</label>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={maxAi} onChange={(e) => setMaxAi(Number(e.target.value))} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Support level</label>
          <select
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            value={supportLevel}
            onChange={(e) => setSupportLevel(e.target.value)}
          >
            <option value="community">community</option>
            <option value="standard">standard</option>
            <option value="priority">priority</option>
            <option value="enterprise">enterprise</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600">Price monthly USD</label>
            <input type="number" step="0.01" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={priceM} onChange={(e) => setPriceM(Number(e.target.value))} />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600">Price yearly USD</label>
            <input type="number" step="0.01" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={priceY} onChange={(e) => setPriceY(Number(e.target.value))} />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">Sort order</label>
          <input type="number" className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} />
        </div>
        <div className="flex items-center gap-2">
          <input type="checkbox" id="active" checked={active} onChange={(e) => setActive(e.target.checked)} />
          <label htmlFor="active" className="text-sm text-slate-700">Active</label>
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">features_included (JSON) — module access & flags</label>
          <textarea className="mt-1 w-full font-mono text-xs rounded-lg border border-slate-200 p-2 min-h-[120px]" value={featuresJson} onChange={(e) => setFeaturesJson(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">optional_addons (JSON)</label>
          <textarea className="mt-1 w-full font-mono text-xs rounded-lg border border-slate-200 p-2 min-h-[80px]" value={addonsJson} onChange={(e) => setAddonsJson(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-slate-600">overage_rules (JSON)</label>
          <textarea className="mt-1 w-full font-mono text-xs rounded-lg border border-slate-200 p-2 min-h-[80px]" value={overageJson} onChange={(e) => setOverageJson(e.target.value)} />
        </div>
        <div className="flex gap-2">
          <button type="submit" className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white">Save</button>
          <button type="button" onClick={() => nav("/billing/plans")} className="rounded-lg border border-slate-200 px-4 py-2 text-sm">Cancel</button>
        </div>
      </form>
    </div>
  );
}
