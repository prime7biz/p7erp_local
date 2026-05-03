import type { ReactNode } from "react";
import { BookOpen, Gavel, ShieldCheck, Zap } from "lucide-react";

export type AutomationTab = "quality" | "drafts" | "rules" | "governance";

interface Props {
  value: AutomationTab;
  onChange: (next: AutomationTab) => void;
  governanceEnabled: boolean;
}

export function AiAutomationTabs({ value, onChange, governanceEnabled }: Props) {
  const tabs: Array<{ id: AutomationTab; label: string; icon: ReactNode; show: boolean }> = [
    { id: "drafts", label: "Draft Actions", icon: <Zap className="h-3.5 w-3.5" />, show: true },
    { id: "quality", label: "Data Quality", icon: <ShieldCheck className="h-3.5 w-3.5" />, show: true },
    { id: "rules", label: "Rules", icon: <BookOpen className="h-3.5 w-3.5" />, show: true },
    { id: "governance", label: "Governance", icon: <Gavel className="h-3.5 w-3.5" />, show: governanceEnabled },
  ];
  return (
    <div role="tablist" className="flex flex-wrap items-center gap-1 rounded-lg border border-border bg-surface-subtle p-1">
      {tabs
        .filter((t) => t.show)
        .map((t) => {
          const active = t.id === value;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onChange(t.id)}
              className={
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition " +
                (active
                  ? "bg-surface-raised text-text-primary shadow-sm"
                  : "text-text-secondary hover:text-text-primary")
              }
            >
              {t.icon}
              {t.label}
            </button>
          );
        })}
    </div>
  );
}
