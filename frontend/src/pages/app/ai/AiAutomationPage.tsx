import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { AiAutomationHeader } from "./components/automation/AiAutomationHeader";
import { AiAutomationTabs, type AutomationTab } from "./components/automation/AiAutomationTabs";
import { AiDataQualityCard } from "./components/automation/AiDataQualityCard";
import { AiActionProposeCard } from "./components/automation/AiActionProposeCard";
import { AiActionRunsTable } from "./components/automation/AiActionRunsTable";
import { AiRulesCatalogCard } from "./components/automation/AiRulesCatalogCard";
import { AiGovernanceInbox } from "./components/automation/AiGovernanceInbox";
import { AiStateNotice } from "./components/AiStateNotice";
import { useAiAutomation } from "./hooks/useAiAutomation";

const TAB_VALUES: readonly AutomationTab[] = ["drafts", "quality", "rules", "governance"] as const;

const ADMIN_ROLES = new Set(["admin", "super_admin", "superadmin", "owner"]);

function isAdminRole(role?: string | null): boolean {
  return ADMIN_ROLES.has((role || "").toLowerCase());
}

function normalizeTab(raw: string | null): AutomationTab {
  if (raw && (TAB_VALUES as readonly string[]).includes(raw)) {
    return raw as AutomationTab;
  }
  return "drafts";
}

export function AiAutomationPage() {
  const { me } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = normalizeTab(searchParams.get("tab"));

  const governanceEnabled = me?.feature_flags?.ai_controlled_automation_enabled === true;
  const isAdmin = isAdminRole(me?.role_name);
  const auto = useAiAutomation({ governanceEnabled });

  useEffect(() => {
    if (tab === "governance" && !governanceEnabled) {
      const p = new URLSearchParams(searchParams);
      p.set("tab", "drafts");
      setSearchParams(p, { replace: true });
    }
  }, [tab, governanceEnabled, searchParams, setSearchParams]);

  const handleTab = (next: AutomationTab) => {
    if (next === "governance" && !governanceEnabled) {
      return;
    }
    const p = new URLSearchParams(searchParams);
    p.set("tab", next);
    setSearchParams(p, { replace: true });
  };

  let body: ReactNode;
  switch (tab) {
    case "quality":
      body = <AiDataQualityCard scan={auto.scan} loading={auto.scanLoading} onRun={auto.runScan} />;
      break;
    case "rules":
      body = <AiRulesCatalogCard rows={auto.rules} loading={auto.rulesLoading} />;
      break;
    case "governance":
      body = !governanceEnabled ? (
        <AiStateNotice message="Governance is not enabled for your tenant." />
      ) : (
        <AiGovernanceInbox
          rows={auto.proposals}
          loading={auto.proposalsLoading}
          statusFilter={auto.proposalsStatus}
          canAct={isAdmin}
          onFilterChange={(s) => void auto.refreshProposals(s)}
          onRefresh={() => void auto.refreshProposals()}
          onApprove={auto.approveProposal}
          onReject={auto.rejectProposal}
          onRollback={auto.rollbackProposal}
        />
      );
      break;
    case "drafts":
    default:
      body = (
        <div className="space-y-4">
          <AiActionProposeCard freshRun={auto.freshRun} onPropose={auto.propose} onConfirm={auto.confirm} />
          <AiActionRunsTable rows={auto.runs} loading={auto.runsLoading} onRefresh={auto.refreshRuns} />
        </div>
      );
  }

  return (
    <div className="space-y-6">
      <AiAutomationHeader />
      <AiAutomationTabs value={tab} onChange={handleTab} governanceEnabled={governanceEnabled} />
      {auto.sessions.error ? <AiStateNotice type="error" message={auto.sessions.error} /> : null}
      {auto.error ? <AiStateNotice type="error" message={auto.error} /> : null}
      {auto.info ? <AiStateNotice message={auto.info} /> : null}
      {body}
    </div>
  );
}
