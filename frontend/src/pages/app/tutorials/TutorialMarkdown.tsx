import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import { CalloutBox } from "./CalloutBox";
import { TutorialImage } from "./TutorialImage";

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const h = href ?? "";
  if (h.startsWith("/") && !h.startsWith("//")) {
    return (
      <Link to={h} className="font-medium text-brand-primary underline-offset-2 hover:underline">
        {children}
      </Link>
    );
  }
  return (
    <a
      href={h}
      className="text-brand-primary underline-offset-2 hover:underline"
      target="_blank"
      rel="noopener noreferrer"
    >
      {children}
    </a>
  );
}

const mdComponents = {
  h2: ({ children }: { children?: ReactNode }) => (
    <h2 className="mt-6 text-base font-semibold text-text-primary first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: ReactNode }) => (
    <h3 className="mt-4 text-sm font-semibold text-text-primary">{children}</h3>
  ),
  p: ({ children }: { children?: ReactNode }) => <p className="mt-2 text-sm leading-relaxed text-text-secondary">{children}</p>,
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
  a: MarkdownLink,
  code: ({ children }: { children?: ReactNode }) => (
    <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-xs text-text-primary">{children}</code>
  ),
  img: ({ src, alt }: { src?: string; alt?: string }) =>
    src ? <TutorialImage src={src} alt={alt ?? ""} className="my-4" /> : null,
  blockquote: ({ children }: { children?: ReactNode }) => (
    <div className="my-4">
      <CalloutBox variant="info">{children}</CalloutBox>
    </div>
  ),
};

export function TutorialMarkdown({ source }: { source: string }) {
  return (
    <div className="tutorial-md max-w-none">
      <ReactMarkdown components={mdComponents}>{source}</ReactMarkdown>
    </div>
  );
}
