import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Loader2, RefreshCw, Send, ShieldCheck, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, type GovernedExceptions, type GovernedFinding, type OwnerBrief } from "@/api/client";
import { AppPageHeader } from "@/components/app/AppPageHeader";
import { DataGrid, type GridColumn } from "@/components/app/data-grid/DataGrid";
import { RowActionsMenu, type RowActionItem } from "@/components/app/RowActionsMenu";
import { useConfirm } from "@/components/app/useConfirm";
import { listPageRootClass, listPageTableCardClass } from "@/components/app/listPageLayout";
import { useAuth } from "@/context/AuthContext";
import { logApiError } from "@/utils/logApiError";
import { ACKNOWLEDGE_ONLY_NOTE, isAcknowledgeOnly } from "./agentFindings";

const SEVERITY_BADGE: Record<string, string> = {
  critical: "bg-red-600 text-white",
  high: "bg-amber-500 text-white",
  medium: "bg-sky-100 text-sky-800",
  low: "bg-slate-100 text-slate-700",
};

const errMsg = (e: unknown, fallback: string) => (e instanceof Error ? e.message : fallback);

/** AI Tools → Exception agents (flag `ai_exception_agents_enabled`). */
export function AiAgentsPage() {
  const { me } = useAuth();
  const enabled = me?.feature_flags?.ai_exception_agents_enabled === true;
  const confirm = useConfirm();
  const [data, setData] = useState<GovernedExceptions | null>(null);
  const [loading, setLoading] = useState(true);
  const [agentFilter, setAgentFilter] = useState("");
  const [openId, setOpenId] = useState<string | number | null>(null);
  const [noteFor, setNoteFor] = useState<GovernedFinding | null>(null);
  const [note, setNote] = useState("");
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setData(await api.getGovernedExceptions());
    } catch (e) {
      logApiError("AiAgentsPage.load", e);
      toast.error(errMsg(e, "Could not run the agents"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (enabled) void load();
  }, [enabled, load]);

  const decide = useCallback(
    async (f: GovernedFinding, decision: "notify" | "dismiss", noteText?: string) => {
      setBusyKey(f.key);
      try {
        const r = await api.confirmGovernedException({ key: f.key, decision, note: noteText || null });
        toast.success(
          decision === "notify"
            ? r.recipients
              ? `Sent to ${r.recipients} person(s)`
              : "Recorded — no other recipient was found"
            : isAcknowledgeOnly(f)
              ? "Acknowledged — hidden for 7 days"
              : "Dismissed for 7 days",
        );
        setNoteFor(null);
        setNote("");
        await load();
      } catch (e) {
        toast.error(errMsg(e, "Could not record the decision"));
      } finally {
        setBusyKey(null);
      }
    },
    [load],
  );

  const rows = useMemo(
    () => (data?.items ?? []).filter((f) => !agentFilter || f.agent === agentFilter),
    [data, agentFilter],
  );

  const columns = useMemo<GridColumn<GovernedFinding>[]>(
    () => [
      {
        id: "severity",
        header: "Severity",
        value: (f) => ["critical", "high", "medium", "low"].indexOf(f.severity),
        cell: (f) => (
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold uppercase ${SEVERITY_BADGE[f.severity] ?? ""}`}>{f.severity}</span>
        ),
      },
      { id: "agent", header: "Agent", value: (f) => f.agent_label, cell: (f) => f.agent_label },
      {
        id: "title",
        header: "Finding",
        alwaysVisible: true,
        value: (f) => f.title,
        cell: (f) => (
          <div className="max-w-xl">
            {f.href ? (
              <Link to={f.href} className="font-medium text-brand-primary hover:underline">
                {f.title}
              </Link>
            ) : (
              <span className="font-medium">{f.title}</span>
            )}
            <p className="text-xs text-text-secondary">{f.detail}</p>
            {isAcknowledgeOnly(f) ? (
              <p className="mt-0.5 text-[11px] text-amber-700" data-testid={`ack-only-${f.key}`}>
                {ACKNOWLEDGE_ONLY_NOTE}
              </p>
            ) : null}
          </div>
        ),
      },
      { id: "recommended", header: "Recommended", value: (f) => f.recommended_action, cell: (f) => <span className="text-xs">{f.recommended_action}</span> },
      {
        id: "actions",
        header: "",
        alwaysVisible: true,
        noExport: true,
        enableSorting: false,
        cell: (f) => {
          const items: RowActionItem[] = [];
          if (f.href) items.push({ key: "open", label: "Open record", href: f.href });
          if (data?.can_confirm && isAcknowledgeOnly(f)) {
            items.push({
              key: "acknowledge",
              label: f.suggested_action.label,
              disabled: busyKey === f.key,
              onClick: async () => {
                if (await confirm({ title: "Acknowledge this finding?", description: "It will be hidden for 7 days unless it changes. Nobody is notified.", confirmLabel: "Acknowledge" }))
                  void decide(f, "dismiss");
              },
            });
          } else if (data?.can_confirm) {
            items.push({
              key: "notify",
              label: `${f.suggested_action.label}…`,
              disabled: busyKey === f.key,
              onClick: () => {
                setNote("");
                setNoteFor(f);
              },
            });
            items.push({
              key: "dismiss",
              label: "Dismiss for 7 days",
              danger: true,
              disabled: busyKey === f.key,
              onClick: async () => {
                if (await confirm({ title: "Dismiss this finding?", description: "It will be hidden for 7 days unless it changes.", confirmLabel: "Dismiss" }))
                  void decide(f, "dismiss");
              },
            });
          }
          return items.length ? <RowActionsMenu rowId={f.key} openId={openId} onOpenChange={setOpenId} items={items} /> : null;
        },
      },
    ],
    [busyKey, confirm, data?.can_confirm, decide, openId],
  );

  if (!enabled) {
    return (
      <div className={listPageRootClass}>
        <AppPageHeader title="Exception agents" description="Rule-based agents that flag problems and propose who to tell." />
        <p className="rounded-xl border border-border bg-surface-raised p-6 text-sm text-text-secondary">
          Exception agents are turned off for this company. An admin can enable them in{" "}
          <Link to="/app/settings/config" className="font-medium text-brand-primary hover:underline">
            Settings → Configuration
          </Link>
          .
        </p>
      </div>
    );
  }

  return (
    <div className={listPageRootClass}>
      <AppPageHeader
        title="Exception agents"
        description="Agents check TNA delays, LC expiry, BOM materials not on PO and finance exceptions. They only propose — nothing is sent until a manager confirms. Finance findings can only be acknowledged."
      />
      <OwnerBriefCard canSend={data?.can_confirm === true} />

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setAgentFilter("")}
          className={`rounded-full border px-3 py-1 text-xs ${!agentFilter ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-border text-text-secondary"}`}
        >
          All ({data?.items.length ?? 0})
        </button>
        {(data?.agents ?? []).map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAgentFilter(a.id)}
            className={`rounded-full border px-3 py-1 text-xs ${agentFilter === a.id ? "border-brand-primary bg-brand-primary/10 text-brand-primary" : "border-border text-text-secondary"}`}
          >
            {a.label} ({a.count})
          </button>
        ))}
        <button
          type="button"
          onClick={() => void load()}
          className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-sm"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /> Run agents
        </button>
      </div>
      {data && data.hidden_recently > 0 ? (
        <p className="text-xs text-text-muted">{data.hidden_recently} finding(s) hidden because someone acted on them recently.</p>
      ) : null}
      {data && !data.can_confirm ? (
        <p className="flex items-center gap-1 text-xs text-text-muted">
          <ShieldCheck className="h-3.5 w-3.5" /> You can review findings; a manager (or a role with “ai.agents.confirm”) sends them.
        </p>
      ) : null}

      <div className={listPageTableCardClass}>
        <DataGrid
          tableKey="ai.exceptions"
          exportName="ai-exceptions"
          columns={columns}
          rows={rows}
          getRowId={(f) => f.key}
          loading={loading}
          emptyState={<p className="p-8 text-center text-sm text-text-muted">No open exceptions. 🎉</p>}
        />
      </div>

      {noteFor ? (
        <div className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 p-4" role="dialog" aria-modal="true" aria-labelledby="notify-title">
          <div className="w-full max-w-md space-y-3 rounded-xl bg-surface-base p-5 shadow-xl">
            <h2 id="notify-title" className="text-sm font-semibold text-text-primary">
              {noteFor.suggested_action.label}
            </h2>
            <p className="text-xs text-text-secondary">
              <strong>{noteFor.title}</strong> — {noteFor.detail}
            </p>
            <label className="block text-xs text-text-secondary">
              Note (optional)
              <textarea
                className="mt-1 w-full rounded-lg border border-border-strong px-2.5 py-1.5 text-sm"
                rows={3}
                maxLength={500}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="e.g. Please confirm the new date by Friday"
              />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" className="rounded-lg border border-border-strong px-3 py-1.5 text-sm" onClick={() => setNoteFor(null)}>
                Cancel
              </button>
              <button
                type="button"
                disabled={busyKey === noteFor.key}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-primary px-3 py-1.5 text-sm font-semibold text-brand-primary-foreground disabled:opacity-50"
                onClick={() => void decide(noteFor, "notify", note.trim())}
              >
                {busyKey === noteFor.key ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Confirm &amp; send
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function OwnerBriefCard({ canSend }: { canSend: boolean }) {
  const confirm = useConfirm();
  const [brief, setBrief] = useState<OwnerBrief | null>(null);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);

  const generate = async () => {
    setLoading(true);
    try {
      setBrief(await api.getOwnerBrief(true));
    } catch (e) {
      toast.error(errMsg(e, "Could not build the brief"));
    } finally {
      setLoading(false);
    }
  };

  const send = async () => {
    if (!brief) return;
    if (!(await confirm({ title: "Send this brief to managers?", description: "Admins and managers get it in their notification inbox.", confirmLabel: "Send" }))) return;
    setSending(true);
    try {
      const r = await api.sendOwnerBrief(brief.narrative);
      toast.success(`Brief sent to ${r.recipients} person(s)`);
    } catch (e) {
      toast.error(errMsg(e, "Could not send the brief"));
    } finally {
      setSending(false);
    }
  };

  return (
    <section className="space-y-2 rounded-xl border border-border bg-surface-raised p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-text-primary">
          <Sparkles className="h-4 w-4 text-brand-primary" /> Owner brief
        </h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => void generate()} disabled={loading} className="inline-flex items-center gap-1 rounded-lg border border-border-strong px-3 py-1.5 text-xs">
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null} {brief ? "Refresh" : "Generate"}
          </button>
          {brief && canSend ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              className="inline-flex items-center gap-1 rounded-lg bg-brand-primary px-3 py-1.5 text-xs font-semibold text-brand-primary-foreground disabled:opacity-50"
            >
              <Send className="h-3.5 w-3.5" /> Send to managers
            </button>
          ) : null}
        </div>
      </div>
      {brief ? (
        <>
          <p className="whitespace-pre-wrap text-sm text-text-primary">{brief.narrative}</p>
          <div className="flex flex-wrap gap-2 text-xs">
            {Object.entries(brief.metrics).map(([k, v]) => (
              <span key={k} className="rounded-full bg-surface-subtle px-2 py-0.5 text-text-secondary">
                {k}: <strong>{v.toLocaleString()}</strong>
              </span>
            ))}
          </div>
          <p className="text-[11px] text-text-muted">
            {brief.source === "ai" ? "Written by AI from the figures above" : "Built from rules (AI not available)"} · {new Date(brief.generated_at).toLocaleString()}
          </p>
        </>
      ) : (
        <p className="text-xs text-text-muted">Generate a short brief from today’s figures and open exceptions.</p>
      )}
    </section>
  );
}
