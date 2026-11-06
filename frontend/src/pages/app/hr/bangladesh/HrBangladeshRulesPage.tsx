/**
 * Bangladesh labour-law rules: rule sets + wage schedule, enforcement switches, read-only checks,
 * and the enforced workflows (wage grades, maternity, earned leave, festival work, service benefits).
 */
import { Link, useSearchParams } from "react-router-dom";
import { HrPageHeader } from "@/components/hr/HrPageHeader";
import { ChecksTab } from "./rules/ChecksTab";
import { EnforcementTab } from "./rules/EnforcementTab";
import { LeaveFestivalTab } from "./rules/LeaveFestivalTab";
import { MaternityTab } from "./rules/MaternityTab";
import { RuleSetsTab } from "./rules/RuleSetsTab";
import { ServiceBenefitsTab } from "./rules/ServiceBenefitsTab";
import { WageGradesTab } from "./rules/WageGradesTab";

const TABS = [
  { id: "rules", label: "Rule sets & wage schedule" },
  { id: "enforcement", label: "Enforcement" },
  { id: "checks", label: "Checks & calculators" },
  { id: "grades", label: "Wage grades" },
  { id: "maternity", label: "Maternity" },
  { id: "leave", label: "Earned leave & festival work" },
  { id: "service", label: "Service benefits" },
] as const;

type TabId = (typeof TABS)[number]["id"];

export function HrBangladeshRulesPage() {
  const [params, setParams] = useSearchParams();
  const tab = (TABS.find((t) => t.id === params.get("tab"))?.id ?? "rules") as TabId;
  const noop = () => undefined;

  return (
    <div className="space-y-6">
      <HrPageHeader
        title="Bangladesh labour-law rules"
        description="Review the official numbers, run checks, and switch on enforcement one area at a time."
        breadcrumbs={[{ label: "HR", href: "/app/hr" }, { label: "Bangladesh setup", href: "/app/hr/bangladesh-setup" }, { label: "Rules" }]}
      />
      <div role="tablist" aria-label="Bangladesh rules sections" className="flex flex-wrap gap-2 border-b border-border pb-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams({ tab: t.id }, { replace: true })}
            className={`rounded-lg px-3 py-1.5 text-sm font-medium ${tab === t.id ? "bg-brand-primary text-white" : "bg-surface-subtle text-text-secondary hover:bg-surface-muted"}`}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel">
        {tab === "rules" && <RuleSetsTab onChanged={noop} />}
        {tab === "enforcement" && <EnforcementTab onChanged={noop} />}
        {tab === "checks" && <ChecksTab />}
        {tab === "grades" && <WageGradesTab />}
        {tab === "maternity" && <MaternityTab />}
        {tab === "leave" && <LeaveFestivalTab />}
        {tab === "service" && <ServiceBenefitsTab />}
      </div>
      <Link to="/app/hr/bangladesh-setup" className="inline-block text-sm text-brand-primary hover:underline">
        ← Back to Bangladesh setup
      </Link>
    </div>
  );
}
