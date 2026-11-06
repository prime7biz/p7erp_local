import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import ReactMarkdown, { type Components, type ExtraProps } from "react-markdown";
import { CalloutBox } from "./CalloutBox";
import { TutorialImage } from "./TutorialImage";
import { createHeadingSlugger } from "./tutorialUi";

type HastElement = NonNullable<ExtraProps["node"]>;

interface HastNode {
  type: string;
  tagName?: string;
  value?: string;
  properties?: Record<string, unknown>;
  children?: HastNode[];
}

function hastText(node: HastNode): string {
  if (node.type === "text") return node.value ?? "";
  return (node.children ?? []).map(hastText).join("");
}

/** Gives every `h2` / `h3` an `id` so the "On this page" list can link to it. */
function rehypeHeadingIds() {
  return (tree: HastNode) => {
    const slug = createHeadingSlugger();
    const walk = (node: HastNode) => {
      if (node.type === "element" && (node.tagName === "h2" || node.tagName === "h3")) {
        node.properties = { ...node.properties, id: slug(hastText(node)) };
      }
      node.children?.forEach(walk);
    };
    walk(tree);
  };
}

const rehypePlugins = [rehypeHeadingIds];

function isBlank(node: HastNode): boolean {
  return node.type === "text" && !(node.value ?? "").trim();
}

function isImage(node: HastNode): boolean {
  return node.type === "element" && node.tagName === "img";
}

/** `> **Tip:** …` → green, `> **Warning:** …` → amber, anything else → blue info box. */
function calloutVariant(node?: HastElement): "info" | "tip" | "warn" {
  const para = node?.children.find((c) => c.type === "element") as HastNode | undefined;
  const first = para?.children?.find((c) => !isBlank(c));
  if (!first || first.type !== "element" || first.tagName !== "strong") return "info";
  const label = hastText(first).trim().toLowerCase();
  if (label.startsWith("tip")) return "tip";
  if (/^(warning|caution|important)/.test(label)) return "warn";
  return "info";
}

function MarkdownLink({ href, children }: { href?: string; children?: ReactNode }) {
  const h = href ?? "";
  if (h.startsWith("#")) {
    return (
      <a href={h} className="font-medium text-brand-primary underline-offset-2 hover:underline">
        {children}
      </a>
    );
  }
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

const mdComponents: Components = {
  h2: ({ children, id }) => (
    <h2 id={id} className="mt-6 scroll-mt-4 text-base font-semibold text-text-primary first:mt-0">
      {children}
    </h2>
  ),
  h3: ({ children, id }) => (
    <h3 id={id} className="mt-4 scroll-mt-4 text-sm font-semibold text-text-primary">
      {children}
    </h3>
  ),
  p: ({ children, node }) => {
    const parts = (node?.children ?? []) as HastNode[];
    if (parts.some(isImage)) {
      if (parts.every((c) => isImage(c) || isBlank(c))) return <>{children}</>;
      return <div className="mt-2 text-sm leading-relaxed text-text-secondary">{children}</div>;
    }
    return <p className="mt-2 text-sm leading-relaxed text-text-secondary">{children}</p>;
  },
  ul: ({ children }) => <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-text-secondary">{children}</ul>,
  ol: ({ children }) => <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm text-text-secondary">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
  a: ({ href, children }) => <MarkdownLink href={href}>{children}</MarkdownLink>,
  code: ({ children }) => (
    <code className="rounded bg-surface-subtle px-1 py-0.5 font-mono text-xs text-text-primary">{children}</code>
  ),
  img: ({ src, alt }) => (src ? <TutorialImage src={src} alt={alt ?? ""} className="my-4" /> : null),
  blockquote: ({ children, node }) => (
    <div className="my-4">
      <CalloutBox variant={calloutVariant(node)}>{children}</CalloutBox>
    </div>
  ),
};

export function TutorialMarkdown({ source }: { source: string }) {
  return (
    <div className="tutorial-md max-w-none">
      <ReactMarkdown components={mdComponents} rehypePlugins={rehypePlugins}>
        {source}
      </ReactMarkdown>
    </div>
  );
}
