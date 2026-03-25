import { cn } from "@/utils/cn";

export type TabItem = { id: string; label: string };

type TabsProps = {
  tabs: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
};

export function Tabs({ tabs, active, onChange, className }: TabsProps) {
  return (
    <div className={cn("border-b border-slate-200 mb-6", className)}>
      <nav className="-mb-px flex flex-wrap gap-4" aria-label="Tabs">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            className={cn(
              "whitespace-nowrap border-b-2 pb-3 px-1 text-sm font-medium transition-colors",
              active === t.id
                ? "border-indigo-600 text-indigo-900"
                : "border-transparent text-slate-500 hover:text-slate-700 hover:border-slate-300",
            )}
          >
            {t.label}
          </button>
        ))}
      </nav>
    </div>
  );
}
