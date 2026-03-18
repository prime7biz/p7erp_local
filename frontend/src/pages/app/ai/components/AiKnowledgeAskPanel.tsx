import { useMemo, useState } from "react";
import type { AiKnowledgeDocumentResponse, AiKnowledgeSourceReference } from "@/api/client";

interface Props {
  disabled?: boolean;
  documents: AiKnowledgeDocumentResponse[];
  loadingDocuments: boolean;
  onAsk: (query: string) => Promise<{ answer: string; usedSources: AiKnowledgeSourceReference[]; disclaimer: string } | null>;
}

export function AiKnowledgeAskPanel({ disabled, documents, loadingDocuments, onAsk }: Props) {
  const [query, setQuery] = useState("What does SOP say about order amendments?");
  const [answer, setAnswer] = useState("");
  const [disclaimer, setDisclaimer] = useState("");
  const [sources, setSources] = useState<AiKnowledgeSourceReference[]>([]);
  const [loading, setLoading] = useState(false);

  const sourceTags = useMemo(() => documents.slice(0, 6), [documents]);

  const run = async () => {
    const clean = query.trim();
    if (!clean) return;
    setLoading(true);
    try {
      const res = await onAsk(clean);
      if (!res) return;
      setAnswer(res.answer);
      setDisclaimer(res.disclaimer);
      setSources(res.usedSources);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <h2 className="mb-2 text-sm font-semibold text-text-primary">Document Q&A</h2>
      <p className="mb-2 text-xs text-text-muted">Ask SOP/manual/policy/help questions from approved sources.</p>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-border px-3 py-2 text-sm outline-none focus:border-focus-ring"
        disabled={disabled || loading}
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled || loading}
        className="mt-2 w-full rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-surface-subtle"
      >
        {loading ? "Searching..." : "Ask Knowledge Base"}
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {loadingDocuments ? (
          <span className="text-[11px] text-text-muted">Loading sources...</span>
        ) : (
          sourceTags.map((doc) => (
            <span key={doc.id} className="rounded-full border border-border bg-surface-subtle px-2 py-0.5 text-[11px] text-text-secondary">
              {doc.title}
            </span>
          ))
        )}
      </div>
      {answer ? <p className="mt-3 text-xs text-text-secondary">{answer}</p> : null}
      {sources.length > 0 ? (
        <div className="mt-2 space-y-1">
          {sources.slice(0, 3).map((s, idx) => (
            <div key={`${s.document_code}-${idx}`} className="rounded border border-status-info/20 bg-status-info-subtle p-2 text-[11px] text-status-info-foreground">
              <span className="font-semibold">{s.document_title}</span>: {s.snippet}
            </div>
          ))}
        </div>
      ) : null}
      {disclaimer ? <p className="mt-2 text-[11px] text-text-muted">{disclaimer}</p> : null}
    </div>
  );
}
