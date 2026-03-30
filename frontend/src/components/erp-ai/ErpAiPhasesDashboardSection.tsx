/**
 * Dashboard section for ERP AI Phases 14–20: advisory JSON, document validation, governance propose/approve.
 * 403 responses show a short notice instead of breaking the page.
 */
import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "@/api/client";
import { logApiError } from "@/utils/logApiError";
import { BarChart3, RefreshCw, Sparkles } from "lucide-react";

type Tab = "exec" | "plan" | "tna" | "finance" | "copilot" | "doc" | "gov";

const COPILOT_INTENTS = [
  "orders_open_count",
  "quotations_draft_count",
  "orders_cancelled_count",
  "quotations_sent_count",
  "vouchers_posted_count",
  "vouchers_in_workflow_count",
  "payment_runs_draft_count",
  "bank_reconciliations_open_count",
  "orders_with_delivery_date_set_count",
  "quotations_approved_count",
] as const;

export function ErpAiPhasesDashboardSection() {
  const [tab, setTab] = useState<Tab>("exec");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [payload, setPayload] = useState<Record<string, unknown> | null>(null);

  const [copilotIntent, setCopilotIntent] = useState<string>(COPILOT_INTENTS[0]);

  const [docEntityType, setDocEntityType] = useState<"order" | "quotation" | "customer">("order");
  const [docEntityId, setDocEntityId] = useState<string>("");
  const [docExtractedJson, setDocExtractedJson] = useState<string>('{\n  "order_code": ""\n}');

  const [govRuleCode, setGovRuleCode] = useState("demo_rule");
  const [govPayloadJson, setGovPayloadJson] = useState<string>('{\n  "status": "x"\n}');
  const [govProposalId, setGovProposalId] = useState<string>("");
  const [govRejectReason, setGovRejectReason] = useState("");

  const run = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    setPayload(null);
    const today = new Date();
    const to = new Date(today);
    to.setDate(to.getDate() + 14);
    try {
      if (tab === "exec") {
        const r = await api.getExecutiveAiBrief();
        setPayload(r as Record<string, unknown>);
      } else if (tab === "plan") {
        const r = await api.postProductionPlanningAdvisory({
          from_date: today.toISOString().slice(0, 10),
          to_date: to.toISOString().slice(0, 10),
        });
        setPayload(r as Record<string, unknown>);
      } else if (tab === "tna") {
        const r = await api.getTnaFollowupAiInsights();
        setPayload(r as Record<string, unknown>);
      } else if (tab === "finance") {
        const r = await api.getFinanceAiReadonlyInsights(6);
        setPayload(r as Record<string, unknown>);
      } else if (tab === "copilot") {
        const r = await api.postErpAiCopilotSafeQuery({ intent: copilotIntent });
        setPayload(r as Record<string, unknown>);
      } else if (tab === "doc") {
        const id = Number(docEntityId);
        if (!Number.isFinite(id) || id <= 0) {
          setMsg("Enter a valid entity ID.");
          setBusy(false);
          return;
        }
        let extracted: Record<string, unknown>;
        try {
          extracted = JSON.parse(docExtractedJson || "{}") as Record<string, unknown>;
        } catch {
          setMsg("Extracted fields must be valid JSON.");
          setBusy(false);
          return;
        }
        const r = await api.postDocumentAiValidate({
          entity_type: docEntityType,
          entity_id: id,
          extracted_fields: extracted,
        });
        setPayload(r as Record<string, unknown>);
      } else {
        let payloadJson: Record<string, unknown> | null = null;
        const raw = govPayloadJson.trim();
        if (raw) {
          try {
            payloadJson = JSON.parse(raw) as Record<string, unknown>;
          } catch {
            setMsg("Governance payload must be valid JSON (or empty).");
            setBusy(false);
            return;
          }
        }
        const r = await api.postErpAiGovernanceProposal({
          rule_code: govRuleCode.trim() || "demo_rule",
          payload_json: payloadJson,
        });
        setPayload(r as Record<string, unknown>);
        const pid = (r as { id?: number }).id;
        if (typeof pid === "number") setGovProposalId(String(pid));
      }
    } catch (e) {
      logApiError("ErpAiPhasesDashboardSection", e);
      setMsg("This insight is disabled or not permitted for your tenant (check feature flags).");
    } finally {
      setBusy(false);
    }
  }, [tab, copilotIntent, docEntityType, docEntityId, docExtractedJson, govRuleCode, govPayloadJson]);

  const govAction = useCallback(
    async (kind: "approve" | "reject" | "rollback") => {
      const id = Number(govProposalId);
      if (!Number.isFinite(id) || id <= 0) {
        setMsg("Enter a proposal ID (use Propose first or type the id).");
        return;
      }
      setBusy(true);
      setMsg(null);
      setPayload(null);
      try {
        let r: Record<string, unknown>;
        if (kind === "approve") r = await api.postErpAiGovernanceApprove(id);
        else if (kind === "reject") r = await api.postErpAiGovernanceReject(id, { reason: govRejectReason || null });
        else r = await api.postErpAiGovernanceRollback(id);
        setPayload(r);
      } catch (e) {
        logApiError("ErpAiPhasesDashboardSection.gov", e);
        setMsg("Action failed (admin only, or proposal missing / phase disabled).");
      } finally {
        setBusy(false);
      }
    },
    [govProposalId, govRejectReason]
  );

  const tabs: { id: Tab; label: string }[] = [
    { id: "exec", label: "Executive (18)" },
    { id: "plan", label: "Planning (14)" },
    { id: "tna", label: "TNA (15)" },
    { id: "finance", label: "Finance (17)" },
    { id: "copilot", label: "Copilot (19)" },
    { id: "doc", label: "Document (16)" },
    { id: "gov", label: "Governance (20)" },
  ];

  const showPrimaryLoad = tab !== "gov";

  return (
    <section className="mb-4">
      <h2 className="text-sm font-semibold text-text-secondary uppercase tracking-[0.12em] mb-2.5">
        ERP AI phases (structured)
      </h2>
      <div className="rounded-xl border border-border bg-surface-raised shadow-sm p-4">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <BarChart3 className="h-4 w-4 text-status-info-foreground" />
          <span className="text-sm font-semibold text-text-primary">Phases 14–20 APIs</span>
        </div>
        <div className="flex flex-wrap gap-1 mb-3">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id);
                setPayload(null);
                setMsg(null);
              }}
              className={`rounded-lg px-2 py-1 text-[11px] border ${
                tab === t.id ? "border-brand-primary bg-brand-primary/10" : "border-border hover:bg-surface-subtle"
              }`}
            >
              {t.label}
            </button>
          ))}
          {showPrimaryLoad ? (
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy}
              className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-xs text-text-secondary hover:bg-surface-subtle disabled:opacity-50 ml-auto"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
              {tab === "doc" ? "Validate" : "Load"}
            </button>
          ) : null}
        </div>

        {tab === "copilot" ? (
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <label className="text-[11px] text-text-muted">Intent</label>
            <select
              value={copilotIntent}
              onChange={(e) => setCopilotIntent(e.target.value)}
              className="rounded-md border border-border bg-surface-subtle px-2 py-1 text-[11px]"
            >
              {COPILOT_INTENTS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {tab === "doc" ? (
          <div className="mb-2 space-y-2 text-[11px]">
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-text-muted">Entity</label>
              <select
                value={docEntityType}
                onChange={(e) => setDocEntityType(e.target.value as typeof docEntityType)}
                className="rounded-md border border-border bg-surface-subtle px-2 py-1"
              >
                <option value="order">order</option>
                <option value="quotation">quotation</option>
                <option value="customer">customer</option>
              </select>
              <label className="text-text-muted">ID</label>
              <input
                type="number"
                min={1}
                value={docEntityId}
                onChange={(e) => setDocEntityId(e.target.value)}
                className="w-24 rounded-md border border-border bg-surface-subtle px-2 py-1"
                placeholder="e.g. 1"
              />
            </div>
            <label className="block text-text-muted">Extracted fields (JSON)</label>
            <textarea
              value={docExtractedJson}
              onChange={(e) => setDocExtractedJson(e.target.value)}
              rows={5}
              className="w-full font-mono rounded-md border border-border bg-surface-subtle p-2 text-[10px]"
            />
          </div>
        ) : null}

        {tab === "gov" ? (
          <div className="mb-2 space-y-2 text-[11px]">
            <div className="flex flex-wrap gap-2 items-center">
              <label className="text-text-muted">rule_code</label>
              <input
                value={govRuleCode}
                onChange={(e) => setGovRuleCode(e.target.value)}
                className="flex-1 min-w-[120px] rounded-md border border-border bg-surface-subtle px-2 py-1"
              />
            </div>
            <label className="block text-text-muted">payload_json</label>
            <textarea
              value={govPayloadJson}
              onChange={(e) => setGovPayloadJson(e.target.value)}
              rows={4}
              className="w-full font-mono rounded-md border border-border bg-surface-subtle p-2 text-[10px]"
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void run()}
                className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-subtle disabled:opacity-50"
              >
                Propose
              </button>
            </div>
            <div className="flex flex-wrap gap-2 items-center pt-2 border-t border-border">
              <label className="text-text-muted">Proposal ID</label>
              <input
                type="number"
                min={1}
                value={govProposalId}
                onChange={(e) => setGovProposalId(e.target.value)}
                className="w-24 rounded-md border border-border bg-surface-subtle px-2 py-1"
              />
              <input
                value={govRejectReason}
                onChange={(e) => setGovRejectReason(e.target.value)}
                placeholder="Reject reason (optional)"
                className="flex-1 min-w-[140px] rounded-md border border-border bg-surface-subtle px-2 py-1"
              />
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void govAction("approve")}
                className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-subtle disabled:opacity-50"
              >
                Approve (admin)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void govAction("reject")}
                className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-subtle disabled:opacity-50"
              >
                Reject (admin)
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => void govAction("rollback")}
                className="rounded-lg border border-border px-2.5 py-1 text-xs hover:bg-surface-subtle disabled:opacity-50"
              >
                Rollback (admin)
              </button>
            </div>
          </div>
        ) : null}

        <p className="text-[11px] text-text-muted mb-2 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1">
            <Sparkles className="h-3 w-3" />
            Advisory / validation — enable env + tenant <code className="text-[10px]">feature_flags</code> when ready.
            Governance approve/reject needs an admin user.
          </span>
          <span className="text-text-secondary">
            Drill-down:{" "}
            <Link to="/app/accounts/vouchers" className="text-brand-primary hover:underline">
              Vouchers
            </Link>
            {" · "}
            <Link to="/app/accounts/reports/ar-ap-aging" className="text-brand-primary hover:underline">
              AR/AP aging
            </Link>
            {" · "}
            <Link to="/app/manufacturing/planning" className="text-brand-primary hover:underline">
              Production planning
            </Link>
          </span>
        </p>
        {msg ? <p className="text-xs text-status-warning-foreground">{msg}</p> : null}
        {payload ? (
          <pre className="mt-2 max-h-64 overflow-auto rounded-md border border-border bg-surface-subtle p-2 text-[10px] text-text-secondary whitespace-pre-wrap">
            {JSON.stringify(payload, null, 2)}
          </pre>
        ) : null}
      </div>
    </section>
  );
}
