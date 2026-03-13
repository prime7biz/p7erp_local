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
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <h2 className="mb-2 text-sm font-semibold text-slate-800">Document Q&A</h2>
      <p className="mb-2 text-xs text-slate-500">Ask SOP/manual/policy/help questions from approved sources.</p>
      <textarea
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        rows={3}
        className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500"
        disabled={disabled || loading}
      />
      <button
        type="button"
        onClick={() => void run()}
        disabled={disabled || loading}
        className="mt-2 w-full rounded-md bg-violet-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
      >
        {loading ? "Searching..." : "Ask Knowledge Base"}
      </button>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {loadingDocuments ? (
          <span className="text-[11px] text-slate-500">Loading sources...</span>
        ) : (
          sourceTags.map((doc) => (
            <span key={doc.id} className="rounded-full border border-slate-300 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-600">
              {doc.title}
            </span>
          ))
        )}
      </div>
      {answer ? <p className="mt-3 text-xs text-slate-700">{answer}</p> : null}
      {sources.length > 0 ? (
        <div className="mt-2 space-y-1">
          {sources.slice(0, 3).map((s, idx) => (
            <div key={`${s.document_code}-${idx}`} className="rounded border border-violet-100 bg-violet-50 p-2 text-[11px] text-violet-900">
              <span className="font-semibold">{s.document_title}</span>: {s.snippet}
            </div>
          ))}
        </div>
      ) : null}
      {disclaimer ? <p className="mt-2 text-[11px] text-slate-500">{disclaimer}</p> : null}
    </div>
  );
}
