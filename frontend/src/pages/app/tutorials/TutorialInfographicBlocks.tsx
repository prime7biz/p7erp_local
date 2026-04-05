import type { TutorialInfographic } from "@/data/tutorials/types";
import { TutorialFlowDiagram } from "./TutorialFlowDiagram";
import { TutorialImage } from "./TutorialImage";
import { CalloutBox } from "./CalloutBox";
import ReactMarkdown from "react-markdown";

interface TutorialInfographicBlocksProps {
  items: TutorialInfographic[];
}

function HighlightBody({ body }: { body: string }) {
  return (
    <div className="text-sm text-text-secondary [&_strong]:font-semibold [&_strong]:text-text-primary">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="m-0 leading-relaxed">{children}</p>,
          strong: ({ children }) => <strong className="font-semibold text-text-primary">{children}</strong>,
        }}
      >
        {body}
      </ReactMarkdown>
    </div>
  );
}

export function TutorialInfographicBlocks({ items }: TutorialInfographicBlocksProps) {
  if (!items.length) return null;

  return (
    <div className="space-y-4">
      {items.map((item, i) => {
        const key = `ig-${i}`;
        if (item.type === "flow") {
          return <TutorialFlowDiagram key={key} title={item.title} steps={item.steps} />;
        }
        if (item.type === "diagram") {
          return (
            <div key={key} className="rounded-xl border border-border bg-surface-subtle/60 p-4">
              {item.title ? (
                <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-muted">{item.title}</p>
              ) : null}
              <TutorialImage src={item.imageSrc} alt={item.imageAlt} caption={item.caption} className="my-0" />
            </div>
          );
        }
        return (
          <CalloutBox key={key} title={item.title} variant="tip">
            <HighlightBody body={item.body} />
          </CalloutBox>
        );
      })}
    </div>
  );
}
