import { useCallback, useEffect, useState } from "react";
import {
  listAiUsage,
  listAiBudgets,
  getAiCosts,
  setAiKillSwitch,
  putAiBudget,
  resetAiBudget,
  getPlatformSettings,
} from "@/api/client";
import { PageHeader } from "@/components/ui/PageHeader";
import { Tabs } from "@/components/ui/Tabs";
import { DataTable } from "@/components/ui/DataTable";
import { StatusBadge } from "@/components/ui/StatusBadge";
import { LoadingState } from "@/components/ui/LoadingState";
import { useToast } from "@/context/ToastContext";
import { formatUsd } from "@/utils/format";
import { formatDateTime } from "@/utils/format";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { useAdminAuth } from "@/context/AdminAuthContext";
import { usePolling } from "@/hooks/usePolling";

export function AIOperationsPage() {
  const { showToast } = useToast();
  const { can } = useAdminAuth();
  const [tab, setTab] = useState<"usage" | "budgets" | "costs">("usage");
  const [usage, setUsage] = useState<import("@/api/client").AiUsageItem[]>([]);
  const [budgets, setBudgets] = useState<import("@/api/client").AiBudgetItem[]>([]);
  const [costs, setCosts] = useState<{ tenant_id: number; total_cost_usd: number; calls: number }[]>([]);
  const [kill, setKill] = useState(false);
  const [loading, setLoading] = useState(true);
  const [confirmKill, setConfirmKill] = useState(false);

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      if (!opts?.silent) setLoading(true);
      try {
        const [u, b, c, gs] = await Promise.all([
          listAiUsage({ limit: 500 }),
          listAiBudgets(),
          getAiCosts(),
          getPlatformSettings().catch(() => null),
        ]);
        setUsage(u.items);
        setBudgets(b.items);
        setCosts(c.by_tenant);
        setKill(gs?.gemini_kill_switch ?? false);
      } catch (e: unknown) {
        if (!opts?.silent) showToast(e instanceof Error ? e.message : "Failed", "error");
      } finally {
        if (!opts?.silent) setLoading(false);
      }
    },
    [showToast],
  );

  useEffect(() => {
    void load();
  }, [load]);

  usePolling(() => void load({ silent: true }), 20_000, true);

  if (loading && usage.length === 0) return <LoadingState />;

  return (
    <div>
      <PageHeader
        title="AI operations"
        description="Usage, budgets, costs, and platform kill switch."
        actions={
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => void load()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Refresh now
            </button>
            {can("operations.ai_manage") && (
              <>
                <StatusBadge variant={kill ? "danger" : "success"}>Kill switch: {kill ? "ON" : "OFF"}</StatusBadge>
                <button
                  type="button"
                  onClick={() => setConfirmKill(true)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                >
                  Toggle kill switch
                </button>
              </>
            )}
          </div>
        }
      />

      <Tabs
        tabs={[
          { id: "usage", label: "Usage" },
          { id: "budgets", label: "Budgets" },
          { id: "costs", label: "Costs by tenant" },
        ]}
        active={tab}
        onChange={(t) => setTab(t as typeof tab)}
      />

      {tab === "usage" && (
        <DataTable
          columns={[
            { key: "id", header: "ID", cell: (r) => r.id },
            { key: "t", header: "Tenant", cell: (r) => r.tenant_id ?? "—" },
            { key: "m", header: "Model", cell: (r) => r.model ?? "—" },
            { key: "f", header: "Feature", cell: (r) => r.feature ?? "—" },
            { key: "tok", header: "Tokens", cell: (r) => r.total_tokens ?? "—" },
            { key: "c", header: "Est. cost", cell: (r) => formatUsd(r.estimated_cost_usd) },
            { key: "d", header: "Time", cell: (r) => formatDateTime(r.created_at) },
          ]}
          rows={usage}
          rowKey={(r) => r.id}
          emptyMessage="No AI usage."
        />
      )}

      {tab === "budgets" && (
        <DataTable
          columns={[
            { key: "t", header: "Tenant", cell: (b) => b.tenant_id },
            { key: "tl", header: "Token limit", cell: (b) => b.monthly_token_limit },
            { key: "cl", header: "Cost limit USD", cell: (b) => formatUsd(b.monthly_cost_limit_usd) },
            { key: "cur", header: "Used tokens", cell: (b) => b.current_month_tokens },
            { key: "th", header: "Throttled", cell: (b) => (b.is_throttled ? "Yes" : "No") },
            {
              key: "a",
              header: "",
              cell: (b) =>
                can("operations.ai_manage") ? (
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="text-xs text-indigo-600"
                      onClick={async () => {
                        const lim = window.prompt("New monthly token limit", String(b.monthly_token_limit));
                        if (lim == null) return;
                        await putAiBudget(b.tenant_id, { monthly_token_limit: parseInt(lim, 10) });
                        showToast("Updated", "success");
                        void load();
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="text-xs text-slate-600"
                      onClick={() =>
                        resetAiBudget(b.tenant_id).then(() => {
                          showToast("Reset", "success");
                          void load();
                        })
                      }
                    >
                      Reset
                    </button>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">—</span>
                ),
            },
          ]}
          rows={budgets}
          rowKey={(b) => b.tenant_id}
          emptyMessage="No budgets."
        />
      )}

      {tab === "costs" && (
        <DataTable
          columns={[
            { key: "t", header: "Tenant", cell: (b) => b.tenant_id },
            { key: "c", header: "Total cost", cell: (b) => formatUsd(b.total_cost_usd) },
            { key: "n", header: "Calls", cell: (b) => b.calls },
          ]}
          rows={costs}
          rowKey={(b) => b.tenant_id}
          emptyMessage="No cost data."
        />
      )}

      <ConfirmDialog
        open={confirmKill}
        onClose={() => setConfirmKill(false)}
        onConfirm={async () => {
          setConfirmKill(false);
          try {
            const next = !kill;
            await setAiKillSwitch(next);
            setKill(next);
            showToast(next ? "Kill switch enabled" : "Kill switch disabled", "success");
            void load();
          } catch (e: unknown) {
            showToast(e instanceof Error ? e.message : "Failed", "error");
          }
        }}
        title="Toggle Gemini kill switch?"
        message="When enabled, Gemini usage should be blocked by the platform (see backend)."
        confirmLabel="Confirm"
      />
    </div>
  );
}
