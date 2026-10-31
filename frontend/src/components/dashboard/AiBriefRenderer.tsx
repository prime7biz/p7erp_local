/** Lightweight markdown-ish renderer for AI brief headings, bullets, and bold lines. */
export function AiBriefRenderer({ text }: { text: string }) {
  return (
    <div className="text-sm text-text-secondary space-y-2">
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <h4 key={i} className="font-semibold text-text-primary mt-3">
              {line.slice(3)}
            </h4>
          );
        }
        if (line.startsWith("- ")) {
          return (
            <li key={i} className="ml-4 list-disc">
              {line.slice(2)}
            </li>
          );
        }
        if (line.startsWith("**") && line.endsWith("**")) {
          return (
            <p key={i} className="font-semibold">
              {line.slice(2, -2)}
            </p>
          );
        }
        return <p key={i}>{line}</p>;
      })}
    </div>
  );
}
