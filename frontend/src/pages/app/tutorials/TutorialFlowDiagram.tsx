import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";

export interface FlowStep {
  label: string;
  href?: string;
}

interface TutorialFlowDiagramProps {
  title?: string;
  steps: FlowStep[];
}

/**
 * Responsive horizontal flow on wide screens; stacks on narrow viewports.
 */
export function TutorialFlowDiagram({ title, steps }: TutorialFlowDiagramProps) {
  if (!steps.length) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-subtle/80 p-4">
      {title ? <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p> : null}
      <ol className="m-0 flex list-none flex-col gap-3 p-0 sm:flex-row sm:flex-wrap sm:items-stretch">
        {steps.map((step, i) => (
          <li key={`${step.label}-${i}`} className="flex min-w-0 flex-1 items-center gap-2 sm:max-w-[11rem] sm:flex-none">
            <div className="min-w-0 flex-1">
              {step.href ? (
                <Link
                  to={step.href}
                  className="block rounded-lg border border-brand-primary/30 bg-surface-raised px-3 py-2 text-center text-xs font-medium text-brand-primary no-underline transition hover:border-brand-primary hover:bg-surface-subtle"
                >
                  {step.label}
                </Link>
              ) : (
                <span className="block rounded-lg border border-border bg-surface-raised px-3 py-2 text-center text-xs font-medium text-text-primary">
                  {step.label}
                </span>
              )}
            </div>
            {i < steps.length - 1 ? (
              <ChevronRight
                className="hidden h-5 w-5 shrink-0 text-text-muted sm:block"
                aria-hidden
              />
            ) : null}
          </li>
        ))}
      </ol>
    </div>
  );
}
