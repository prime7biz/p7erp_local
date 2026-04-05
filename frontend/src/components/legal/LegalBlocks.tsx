import type { LegalContentBlock } from "@/data/legal/types";

function Block({ block }: { block: LegalContentBlock }) {
  switch (block.kind) {
    case "p":
      return <p className="text-text-secondary leading-relaxed">{block.text}</p>;
    case "h3":
      return <h3 className="text-lg font-semibold text-text-primary pt-2">{block.text}</h3>;
    case "ul":
      return (
        <ul className="list-disc pl-6 space-y-1.5 text-text-secondary">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      );
    case "ol":
      return (
        <ol className="list-decimal pl-6 space-y-1.5 text-text-secondary">
          {block.items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ol>
      );
    case "callout":
      return (
        <div className="rounded-lg border border-border bg-surface-subtle p-4 not-prose my-2">
          {block.title ? <p className="text-sm font-semibold text-text-primary mb-2">{block.title}</p> : null}
          <ul className="list-disc pl-5 text-sm text-text-secondary space-y-1">
            {block.items.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      );
    default:
      return null;
  }
}

export function LegalBlocks({ blocks }: { blocks: LegalContentBlock[] }) {
  return (
    <div className="space-y-4">
      {blocks.map((block, i) => (
        <Block key={`${block.kind}-${i}`} block={block} />
      ))}
    </div>
  );
}
