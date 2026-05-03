import { BookOpen, Check, X } from "lucide-react";
import type { AiAutomationRuleRow } from "@/api/client";

interface Props {
  rows: AiAutomationRuleRow[];
  loading: boolean;
}

export function AiRulesCatalogCard({ rows, loading }: Props) {
  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <div className="mb-3 flex items-center gap-2">
        <BookOpen className="h-4 w-4 text-text-muted" />
        <h2 className="text-sm font-semibold text-text-primary">Automation rule catalog</h2>
      </div>
      <p className="mb-3 text-xs text-text-muted">
        Rules the system can use for draft actions. Each requires your explicit confirmation before it executes.
      </p>
      {loading && rows.length === 0 ? (
        <p className="text-sm text-text-muted">Loading rules...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-text-muted">No automation rules found.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => (
            <li key={r.rule_code} className="rounded-lg border border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-[11px] text-text-muted">{r.rule_code}</span>
                <span className="text-sm font-semibold text-text-primary">{r.label}</span>
                {r.is_enabled ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-status-success-subtle px-2 py-0.5 text-[10px] text-status-success-foreground">
                    <Check className="h-3 w-3" /> enabled
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-status-neutral-subtle px-2 py-0.5 text-[10px] text-text-muted">
                    <X className="h-3 w-3" /> disabled
                  </span>
                )}
                {r.requires_confirmation ? (
                  <span className="rounded-full bg-status-warning-subtle px-2 py-0.5 text-[10px] text-status-warning-foreground">
                    requires confirmation
                  </span>
                ) : null}
              </div>
              {r.description ? <p className="mt-1 text-xs text-text-secondary">{r.description}</p> : null}
              <p className="mt-1 text-[11px] text-text-muted">
                action: <code>{r.action_key}</code>
                {r.permission_key ? (
                  <>
                    {" "}
                    &middot; permission: <code>{r.permission_key}</code>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
