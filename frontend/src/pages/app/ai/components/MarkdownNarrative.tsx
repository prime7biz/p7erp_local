import type { ReactNode } from "react";
import ReactMarkdown from "react-markdown";

const mdComponents = {
  h1: ({ children }: { children?: ReactNode }) => (
    <h1 className="text-lg font-semibold text-text-primary first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-4 text-base font-semibold text-text-primary first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-3 text-sm font-semibold text-text-primary">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => (
    <p className="mt-2 text-sm leading-relaxed text-text-secondary first:mt-0">{children}</p>
  ),
  ul: ({ children }: { children?: ReactNode }) => (
    <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">{children}</ul>
  ),
  ol: ({ children }: { children?: ReactNode }) => (
    <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">{children}</ol>
  ),
  li: ({ children }: { children?: ReactNode }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }: { children?: ReactNode }) => (
    <strong className="font-semibold text-text-primary">{children}</strong>
  ),
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-xs text-text-primary">{children}</code>
  ),
  a: ({ children, href }: { children?: ReactNode; href?: string }) => (
    <a
      className="text-brand-primary underline-offset-2 hover:underline"
      href={href ?? "#"}
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  ),
};

export function MarkdownNarrative({ source, className }: { source: string; className?: string }) {
  return (
    <div className={className ?? "max-w-none text-text-secondary"}>
      <ReactMarkdown components={mdComponents}>{source}</ReactMarkdown>
    </div>
  );
}
