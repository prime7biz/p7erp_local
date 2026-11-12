import type { ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { Link } from "react-router-dom";
import { safeInternalPath } from "@/utils/safeUrl";

/**
 * Markdown for AI agent answers. The text can repeat words from ERP records, so it is treated as
 * untrusted: no raw HTML (react-markdown default), no images, and only internal `/app/...` links.
 * Any other link is shown as plain text.
 */
function AgentLink({ href, children }: { href?: string; children?: ReactNode }) {
  const path = safeInternalPath(href);
  if (path && path.startsWith("/app/")) {
    return (
      <Link to={path} className="font-medium text-brand-primary underline-offset-2 hover:underline">
        {children}
      </Link>
    );
  }
  return <span>{children}</span>;
}

const components: Components = {
  h1: ({ children }) => <p className="mt-2 font-semibold text-text-primary first:mt-0">{children}</p>,
  h2: ({ children }) => <p className="mt-2 font-semibold text-text-primary first:mt-0">{children}</p>,
  h3: ({ children }) => <p className="mt-2 font-semibold text-text-primary first:mt-0">{children}</p>,
  p: ({ children }) => <p className="mt-2 leading-relaxed first:mt-0">{children}</p>,
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  code: ({ children }) => (
    <code className="rounded bg-surface-raised px-1 py-0.5 font-mono text-xs text-text-primary">{children}</code>
  ),
  a: ({ href, children }) => <AgentLink href={href}>{children}</AgentLink>,
  img: () => null,
};

export function AiAgentMarkdown({ source }: { source: string }) {
  return (
    <div className="break-words">
      <ReactMarkdown components={components} disallowedElements={["img"]} skipHtml>
        {source}
      </ReactMarkdown>
    </div>
  );
}
