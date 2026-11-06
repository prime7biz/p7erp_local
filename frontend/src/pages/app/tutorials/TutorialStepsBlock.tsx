import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { ExternalLink } from "lucide-react";
import type { TutorialStep } from "@/data/tutorials/types";
import { TutorialImage } from "./TutorialImage";

/** Numbered, illustrated walkthrough: each step has a title, short text and an optional screenshot. */
export function TutorialStepsBlock({ title, steps }: { title?: string; steps: TutorialStep[] }) {
  if (!steps.length) return null;

  return (
    <div className="rounded-xl border border-border bg-surface-subtle/60 p-4">
      {title ? <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{title}</p> : null}
      <ol className="m-0 list-none space-y-5 p-0">
        {steps.map((step, i) => (
          <li key={`${step.title}-${i}`} className="relative flex gap-3">
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs font-semibold text-white"
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 text-sm font-semibold text-text-primary">
                <span className="sr-only">Step {i + 1}: </span>
                {step.title}
              </p>
              {step.body ? (
                <div className="mt-1 text-sm leading-relaxed text-text-secondary">
                  <ReactMarkdown
                    components={{
                      p: ({ children }) => <p className="m-0 mt-1">{children}</p>,
                      strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
                      code: ({ children }) => (
                        <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-primary">
                          {children}
                        </code>
                      ),
                    }}
                  >
                    {step.body}
                  </ReactMarkdown>
                </div>
              ) : null}
              {step.href ? (
                <Link
                  to={step.href}
                  className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-brand-primary no-underline hover:underline"
                >
                  Open this screen
                  <ExternalLink className="h-3 w-3" aria-hidden />
                </Link>
              ) : null}
              {step.imageSrc ? (
                <TutorialImage
                  src={step.imageSrc}
                  alt={step.imageAlt ?? step.title}
                  className="mb-0 mt-2"
                  previewClassName="max-h-80"
                />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
